import { JsonStore } from "./store.mts";
import type { TxKind } from "@fc/shared";
import {
  defineChain,
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  keccak256,
  toHex,
  parseAbi,
  encodeEventTopics,
  decodeEventLog,
  hashTypedData,
  recoverAddress,
  type PublicClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/**
 * Blockchain mirror — BOT Chain (Bohr), chainId 968 (testnet) / 677 (mainnet).
 *
 * Constraint (research-validated FRC-D01): mainnet official RPCs limit/timeout
 * eth_getLogs. We never rely on log indexing — every write is persisted with
 * its tx hash + receipt status, and chain anchors (the contract's own release
 * ids) are recovered from the RECEIPT of our own broadcast, not from history.
 *
 * The mirror executes the contract's real state machine:
 *   product line registered → RELEASE_PROPOSED (broadcaster = MANUFACTURER)
 *   security decision       → approveRelease EIP-712 signed by the SECURITY signer
 *   operator decision       → approveRelease EIP-712 signed by the OPERATOR signer
 *   canary/rollout ops      → broadcaster holds OPERATOR_ROLE
 *
 * Relay-signer model: GOV_OPERATOR_SIGNER_KEY / GOV_SECURITY_SIGNER_KEY are pure
 * signing identities registered on-chain via registerSigner(); the broadcaster
 * relays their approval signatures (they need no gas). In production these keys
 * belong to each approver; see docs/SECURITY_MODEL.md.
 *
 * Broadcast honesty: a tx is CONFIRMED only when a receipt reports success.
 * Until then it stays ANNOUNCED (with the hash if one exists) — never fabricated.
 */

const botChain = defineChain({
  id: Number(process.env.GOV_CHAIN_ID ?? 968),
  name: process.env.GOV_CHAIN_ID === "677" ? "BOT Chain" : "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.GOV_RPC_URL ?? (Number(process.env.GOV_CHAIN_ID ?? 968) === 677 ? "https://rpc.botchain.ai" : "https://rpc.bohr.life")],
    },
  },
});

const ABI = [
  ...parseAbi([
    "function proposeRelease(bytes32 productLineId, bytes32 versionHash, bytes32 manifestDigest) returns (bytes32)",
    "function openCanary(bytes32 releaseId, bytes32 rolloutPolicyHash) returns (bytes32)",
    "function recordCanaryResult(bytes32 releaseId, bool success)",
    "function authoriseRollout(bytes32 releaseId) returns (bool)",
    "function advanceRollout(bytes32 releaseId, uint8 stage)",
    "function pauseRollout(bytes32 releaseId)",
    "function resumeRollout(bytes32 releaseId)",
    "function revokeRelease(bytes32 releaseId)",
    "function registerProductLine(bytes32 id, bytes32 metadataHash) returns (bytes32)",
    "function registerSigner(address signer, bytes32 role)",
    "function productLines(bytes32) view returns (bytes32 id, address manufacturer, bytes32 metadataHash, bool active)",
  ]),
] as const;

const DECISION_ABI = [
  ...parseAbi([
    "function approveRelease(bytes32 releaseId, uint8 decision, uint256 nonce, uint256 deadline, bytes signature) returns (bytes32)",
    "function consumedNonces(bytes32, address) view returns (uint256)",
  ]),
] as const;

const EIP712_DOMAIN = { name: "FirmwareCouncil", version: "1" };
const EIP712_TYPES = {
  Approval: [
    { name: "releaseId", type: "bytes32" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

/**
 * Sign an EIP-712 Approval over the message typed exactly like the contract's
 * _APPROVAL_TYPEHASH (proven byte-equal to the live contract via ProbeDomain).
 *
 * NOTE: we do NOT use account.signTypedData for the final signature — its
 * recovered address diverged from its own hashTypedData under certain domain
 * shapes. Instead we hash with hashTypedData, assert local recovery, then sign
 * the raw digest, which is deterministic and matches OZ's ECDSA.recover.
 */
async function signApproval(
  signer: PrivateKeyAccount,
  contract: `0x${string}`,
  chainId: number,
  message: { releaseId: `0x${string}`; decision: number; nonce: bigint; deadline: bigint },
): Promise<`0x${string}`> {
  const digest = await hashTypedData({
    domain: { ...EIP712_DOMAIN, chainId, verifyingContract: contract },
    types: EIP712_TYPES,
    primaryType: "Approval" as const,
    message,
  });
  const signature = await signer.sign({ hash: digest });
  const signerCheck = await recoverAddress({ hash: digest, signature });
  if (String(signerCheck).toLowerCase() !== signer.address.toLowerCase()) {
    throw new Error(`internal: EIP-712 signature self-recovery failed (${signerCheck} != ${signer.address}); not broadcasting`);
  }
  return signature;
}

const RELEASE_PROPOSED_EVENT = {
  type: "event",
  name: "ReleaseProposed",
  inputs: [
    { name: "releaseId", type: "bytes32", indexed: true },
    { name: "productLineId", type: "bytes32", indexed: true },
    { name: "versionHash", type: "bytes32" },
    { name: "manifestDigest", type: "bytes32" },
    { name: "manufacturer", type: "address", indexed: true },
  ],
} as const;

const b32 = (x: string) => keccak256(toHex(x) as `0x${string}`);
const digestToBytes32 = (s: string): `0x${string}` => {
  const clean = s.replace(/^0x/, "");
  return `0x${clean.length >= 64 ? clean.slice(0, 64) : clean.padStart(64, "0")}` as `0x${string}`;
};

/** Map app decisions to the contract's EIP-712 Decision enum (Reject/RequestChanges both → 1). */
function decisionByte(decision: string): 0 | 1 | 2 {
  if (decision === "APPROVE" || decision === "APPROVED") return 0;
  if (decision === "REJECT" || decision === "REJECTED") return 1;
  return 2; // request-changes still records a Reject on chain once re-review happens
}

export class BlockchainMirror {
  private store: JsonStore;
  private contract?: `0x${string}`;
  private broadcasterKey?: `0x${string}`;
  private broadcaster?: PrivateKeyAccount;
  private operatorSigner?: PrivateKeyAccount;
  private securitySigner?: PrivateKeyAccount;
  private pub?: PublicClient;
  /** serialises broadcasts from the broadcaster key (nonce safety) */
  private sendTail: Promise<unknown> = Promise.resolve();

  constructor(store: JsonStore) {
    this.store = store;
    const addr = process.env.GOV_CONTRACT_ADDRESS;
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) this.contract = addr as `0x${string}`;

    const bs = process.env.GOV_PRIVATE_KEY;
    if (bs && /^0x[0-9a-fA-F]{64}$/.test(bs.startsWith("0x") ? bs : `0x${bs}`)) {
      this.broadcasterKey = (bs.startsWith("0x") ? bs : `0x${bs}`) as `0x${string}`;
      this.broadcaster = privateKeyToAccount(this.broadcasterKey);
    }
    const osKey = process.env.GOV_OPERATOR_SIGNER_KEY;
    if (osKey && /^0x[0-9a-fA-F]{64}$/.test(osKey.startsWith("0x") ? osKey : `0x${osKey}`)) {
      this.operatorSigner = privateKeyToAccount((osKey.startsWith("0x") ? osKey : `0x${osKey}`) as `0x${string}`);
    }
    const ssKey = process.env.GOV_SECURITY_SIGNER_KEY;
    if (ssKey && /^0x[0-9a-fA-F]{64}$/.test(ssKey.startsWith("0x") ? ssKey : `0x${ssKey}`)) {
      this.securitySigner = privateKeyToAccount((ssKey.startsWith("0x") ? ssKey : `0x${ssKey}`) as `0x${string}`);
    }

    if (this.contract) {
      this.pub = createPublicClient({ chain: botChain, transport: http(botChain.rpcUrls.default.http[0]) });
    }
  }

  status() {
    return {
      chainMirrorEnabled: true,
      contract: this.contract ?? null,
      broadcaster: this.broadcaster?.address ?? null,
      operatorSigner: this.operatorSigner?.address ?? null,
      securitySigner: this.securitySigner?.address ?? null,
      broadcastCapable: !!(this.contract && this.broadcasterKey),
      chainId: Number(process.env.GOV_CHAIN_ID ?? 968),
    };
  }

  /** Persist the intent, then broadcast when the deployment is configured. */
  async record(kind: TxKind, relatedEntityId: string, payload?: Record<string, unknown>): Promise<any> {
    const tx = this.store.put("transactions", {
      kind,
      relatedEntityId,
      chainId: Number(process.env.GOV_CHAIN_ID ?? 968),
      status: "PENDING",
      createdAt: new Date().toISOString(),
    });
    if (!this.contract || !this.broadcasterKey) {
      this.store.update("transactions", tx.id, {
        status: "ANNOUNCED",
        error: "governance mirror not broadcast: GOV_CONTRACT_ADDRESS / GOV_PRIVATE_KEY not configured (see docs/KNOWN_LIMITATIONS.md)",
      });
      return tx;
    }
    try {
      // Serialise everything behind the previous broadcast so per-key nonces and
      // per-release chain order both stay deterministic.
      const done = this.sendTail.then(() => this.broadcast(tx, kind, relatedEntityId, payload));
      // never let one failure wedge the queue
      this.sendTail = done.catch(() => undefined);
      return await done;
    } catch (err: any) {
      this.store.update("transactions", tx.id, { status: "FAILED", error: String(err?.details ?? err?.message ?? err) });
      return this.store.get("transactions", tx.id);
    }
  }

  /** The chain-side release id of an app release, recovered from our own receipts. */
  private chainReleaseAnchor(appReleaseId: string): `0x${string}` | undefined {
    const rec = this.store
      .list("transactions")
      .filter((t) => t.kind === "RELEASE_PROPOSED" && t.relatedEntityId === appReleaseId && t.chainReleaseId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    return rec?.chainReleaseId as `0x${string}` | undefined;
  }

  private async lineIsActive(plId: `0x${string}`): Promise<boolean> {
    const res = await this.pub!.call({
      to: this.contract!,
      data: encodeFunctionData({ abi: ABI, functionName: "productLines", args: [plId] }),
    });
    return decodeFunctionDataResult(res.data)?.active ?? false;
  }

  private async broadcast(tx: any, kind: TxKind, entityId: string, payload?: Record<string, unknown>): Promise<any> {
    const wallet = createWalletClient({
      chain: botChain,
      transport: http(botChain.rpcUrls.default.http[0]),
      account: this.broadcaster!,
    });

    let stampPre: Record<string, unknown> = {};
    let call: { functionName: string; abi: any; args: readonly unknown[] } | undefined;
    switch (kind) {
      case "PRODUCT_LINE_REGISTERED": {
        const pl = this.store.get("productLines", entityId);
        if (!pl) return this.announceOnly(tx, `${kind}: product line ${entityId} not found in store`);
        const plId = b32(pl.id);
        // Idempotent across re-seeds: if the line is already active on chain,
        // the registration is attested — re-sending would revert "exists".
        if (await this.lineIsActive(plId)) {
          return this.announceOnly(tx, "already registered on chain (idempotent re-attest; no broadcast)");
        }
        call = { functionName: "registerProductLine", abi: ABI, args: [plId, b32(pl.organisationId ?? "firmwarecouncil")] };
        break;
      }
      case "RELEASE_PROPOSED": {
        const existing = this.chainReleaseAnchor(entityId);
        if (existing) {
          return this.announceOnly(tx, "already anchored on chain (idempotent re-attest; no broadcast)");
        }
        const rel = this.store.get("releases", entityId);
        if (!rel) return this.announceOnly(tx, `${kind}: release ${entityId} not found in store`);
        // versionHash is salted with the app release uuid: e2e re-seeds recreate
        // ("line, version") pairs, and the contract's collision guard correctly
        // refuses duplicates — the salt makes every governance instance unique.
        const versionHash = keccak256(
          toHex(`${rel.productLineId}:${rel.manifest.version}:${entityId}`) as `0x${string}`,
        );
        // ensure the product line exists on chain first (free read; register lazily)
        const plId = b32(rel.productLineId);
        if (!(await this.lineIsActive(plId).catch(() => false))) {
          const regHash = await wallet.writeContract({
            address: this.contract!, abi: ABI, functionName: "registerProductLine",
            args: [plId, b32(rel.organisationId ?? rel.productLineId)],
          });
          // the proposal MUST see the registered line — wait for the register receipt
          const reg = await this.pub!.waitForTransactionReceipt({ hash: regHash, timeout: 45_000 }).catch(() => null);
          if (!reg || reg.status !== "success") {
            this.store.update("transactions", tx.id, {
              status: "FAILED",
              error: `registerProductLine did not confirm before proposeRelease (${regHash})`,
            });
            return this.store.get("transactions", tx.id);
          }
          stampPre = { registerLineTx: regHash, registerLineBlock: Number(reg.blockNumber) };
        }
        call = {
          functionName: "proposeRelease", abi: ABI,
          args: [plId, versionHash, digestToBytes32(rel.manifest.manifestDigest)],
        };
        break;
      }
      case "RELEASE_APPROVED":
      case "RELEASE_REJECTED": {
        const anchor = this.chainReleaseAnchor(entityId);
        if (!anchor) return this.announceOnly(tx, `not broadcast: no on-chain release anchor yet for ${entityId} (RELEASE_PROPOSED must confirm first)`);
        const signer = payload?.governanceRole === "SECURITY_REVIEWER" ? this.securitySigner : this.operatorSigner;
        if (!signer) return this.announceOnly(tx, `not broadcast: signer key for ${payload?.governanceRole ?? "OPERATOR"} decision not configured (GOV_SECURITY_SIGNER_KEY / GOV_OPERATOR_SIGNER_KEY)`);
        const decision = decisionByte(
          kind === "RELEASE_APPROVED"
            ? String(payload?.decision ?? "APPROVE")
            : String(payload?.decision ?? "REJECT"),
        );
        if (decision === 2) {
          // request-changes is an app-level loop (re-review after edits); the
          // contract only supports terminal Reject — do not close it on chain.
          return this.announceOnly(tx, "not broadcast: request-changes is an application-level review loop (no terminal chain decision; see docs/SECURITY_MODEL.md)");
        }
        const nonce = (
          (await this.pub!.readContract({ address: this.contract!, abi: DECISION_ABI, functionName: "consumedNonces", args: [anchor, signer.address] })) + 1n
        );
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        const signature = await signApproval(signer, this.contract!, botChain.id, { releaseId: anchor, decision, nonce, deadline });
        call = {
          functionName: "approveRelease", abi: DECISION_ABI,
          args: [anchor, decision, nonce, deadline, signature],
        };
        break;
      }
      case "CANARY_OPENED": {
        const anchor = this.anchorOrAnnounce(tx, entityId);
        if (!anchor) return this.store.get("transactions", tx.id);
        const policy = this.store.find("rolloutPolicies", (p) => p.releaseId === entityId);
        call = {
          functionName: "openCanary", abi: ABI,
          args: [anchor, b32(policy ? JSON.stringify(policy) : `${entityId}:canary`)],
        };
        break;
      }
      case "CANARY_RESULT": {
        const anchor = this.anchorOrAnnounce(tx, entityId);
        if (!anchor) return this.store.get("transactions", tx.id);
        call = { functionName: "recordCanaryResult", abi: ABI, args: [anchor, Boolean(payload?.success)] };
        break;
      }
      case "ROLLOUT_AUTHORISED": {
        const anchor = this.anchorOrAnnounce(tx, entityId);
        if (!anchor) return this.store.get("transactions", tx.id);
        call = { functionName: "authoriseRollout", abi: ABI, args: [anchor] };
        break;
      }
      case "ROLLOUT_ADVANCED": {
        const anchor = this.anchorOrAnnounce(tx, entityId);
        if (!anchor) return this.store.get("transactions", tx.id);
        call = { functionName: "advanceRollout", abi: ABI, args: [anchor, Number(payload?.stage ?? 0)] };
        break;
      }
      case "ROLLOUT_PAUSED": {
        const anchor = this.anchorOrAnnounce(tx, entityId);
        if (!anchor) return this.store.get("transactions", tx.id);
        call = { functionName: "pauseRollout", abi: ABI, args: [anchor] };
        break;
      }
      case "RELEASE_REVOKED": {
        const anchor = this.anchorOrAnnounce(tx, entityId);
        if (!anchor) return this.store.get("transactions", tx.id);
        call = { functionName: "revokeRelease", abi: ABI, args: [anchor] };
        break;
      }
      case "BATCH_RECEIPT": {
        const anchor = this.anchorOrAnnounce(tx, entityId);
        if (!anchor) return this.store.get("transactions", tx.id);
        call = {
          functionName: "recordBatchReceipt", abi: ABI,
          args: [anchor, b32(String(payload?.receiptRoot ?? "")), Number(payload?.count ?? 0)],
        };
        break;
      }
      default:
        // DOCUMENTED GAP: app-internal workflows (incidents, integrations) have
        // no on-chain counterpart; they are recorded as ANNOUNCED, honestly.
        return this.announceOnly(tx, `not broadcast: no calibrated writer for kind ${kind} (see docs/SECURITY_MODEL.md)`);
    }

    const data = encodeFunctionData({ abi: call!.abi, functionName: call!.functionName as any, args: call!.args as any });
    const hash = await wallet.sendTransaction({ to: this.contract!, data });
    this.store.update("transactions", tx.id, { hash, status: "ANNOUNCED" });

    const receipt = await this.pub!
      .waitForTransactionReceipt({ hash, timeout: 45_000 })
      .catch(() => null);

    if (!receipt) {
      // Broadcast happened, but not yet mined — keep honest ANNOUNCED + hash.
      this.store.update("transactions", tx.id, {
        status: "ANNOUNCED",
        error: "broadcast accepted; receipt not observed within timeout — explorer will confirm",
      });
      return this.store.get("transactions", tx.id);
    }
    if (receipt.status !== "success") {
      this.store.update("transactions", tx.id, { status: "FAILED", error: "transaction reverted on chain", blockNumber: Number(receipt.blockNumber) });
      return this.store.get("transactions", tx.id);
    }

    // Recover the contract's own release id from the receipt of our own tx
    // (never from eth_getLogs — policy FRC-D01).
    const anchors: string[] = [];
    try {
      const topics = encodeEventTopics({ abi: [RELEASE_PROPOSED_EVENT], eventName: "ReleaseProposed" });
      for (const log of receipt.logs) {
        if (log.topics[0] !== topics[0]) continue;
        const decoded = decodeEventLog({ abi: [RELEASE_PROPOSED_EVENT], data: log.data, topics: log.topics as any }) as any;
        anchors.push(String(decoded.args.releaseId));
      }
    } catch { /* none */ }

    const stamp: Record<string, unknown> = {
      ...stampPre,
      status: "CONFIRMED",
      blockNumber: Number(receipt.blockNumber),
      explorer: `https://scan.bohr.life/tx/${hash}`,
    };
    if (kind === "RELEASE_PROPOSED" && anchors[0] && this.chainReleaseAnchor(entityId) !== anchors[0]) {
      stamp.chainReleaseId = anchors[0];
      stamp.anchorNote = "on-chain releaseId recovered from own tx receipt (FRC-D01 — no log indexer)";
    }
    this.store.update("transactions", tx.id, stamp);
    return this.store.get("transactions", tx.id);
  }

  private anchorOrAnnounce(tx: any, releaseId: string): `0x${string}` | undefined {
    const anchor = this.chainReleaseAnchor(releaseId);
    if (anchor) return anchor;
    this.store.update("transactions", tx.id, {
      status: "ANNOUNCED",
      error: `not broadcast: on-chain release anchor for ${releaseId} not established (RELEASE_PROPOSED must confirm first)`,
    });
    return undefined;
  }

  private announceOnly(tx: any, reason: string) {
    this.store.update("transactions", tx.id, { status: "ANNOUNCED", error: reason });
    return this.store.get("transactions", tx.id);
  }
}

/** decode the struct returned by the auto-generated productLines() getter */
function decodeFunctionDataResult(data: string): { active: boolean } | null {
  const raw = data.replace(/^0x/, "");
  // static tuple(bytes32,address,bytes32,bool) → active flag = last word
  if (raw.length < 64 * 4) return null;
  return { active: BigInt(`0x${raw.slice(64 * 3, 64 * 4)}`) === 1n };
}
