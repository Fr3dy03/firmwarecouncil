/**
 * Bisect viem's signTypedData vs the contract's expected digest — all with one
 * fixed set of signing parameters so every number is comparable.
 *
 *   A. manual OZ digest = keccak(0x1901 || dsOZ || shOZ)      (matches the probe)
 *   B. viem digest      = hashTypedData(viem-domain, ...)     (what signTypedData signs)
 *   C. recover the viem signature over A and B → which does viem actually sign?
 *   D. eth_call approveRelease on ProbeDomain with a signature built from A directly
 */
import { hashTypedData, keccak256, encodeFunctionData, recoverAddress, concat } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, http } from "viem";

const chainId = Number(process.env.GOV_CHAIN_ID ?? 968);
const rpc = process.env.GOV_RPC_URL ?? "https://rpc.bohr.life";
const secKey = (process.env.GOV_SECURITY_SIGNER_KEY ?? "") as `0x${string}`;
const probe = "0x0f34e83d268c84a4e3cbd711e0eed013f679b6d6" as `0x${string}`;
const governance = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;

const anchor = "0x17bba97aae88649ea9c057cdf11bc9999036e45f3012c0c48f03ff739c2138f5" as `0x${string}`;
const decision = 0;
const nonce = 1n;
const deadline = 1794000000n; // fixed so every computation below is comparable

const signer = privateKeyToAccount(secKey);
const pub = createPublicClient({ transport: http(rpc) });

// ---- A. manual OZ digest --------------------------------------------
const w = (x: bigint | number) => ("0x" + x.toString(16).padStart(64, "0")) as `0x${string}`;
const hx = (s: string) => s.replace(/^0x/, "");
const pack = (arr: string[]) => concat(arr.map((a) => ("0x" + hx(a)) as `0x${string}`)) as `0x${string}`;

const TYPE_DOMAIN = keccak256(new TextEncoder().encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)") as any);
const hashedName = keccak256(new TextEncoder().encode("FirmwareCouncil") as any);
const hashedVersion = keccak256(new TextEncoder().encode("1") as any);
const APPROVAL_TYPEHASH = keccak256(new TextEncoder().encode("Approval(bytes32 releaseId,uint8 decision,uint256 nonce,uint256 deadline)") as any);

function ozDomainSeparator(verifying: `0x${string}`) {
  return keccak256(pack([TYPE_DOMAIN, hashedName, hashedVersion, w(BigInt(chainId)), w(BigInt(verifying))]) as any);
}
function ozStructHash() {
  return keccak256(pack([APPROVAL_TYPEHASH, anchor, w(decision), w(nonce), w(deadline)]) as any);
}
function toTypedDataHash(ds: `0x${string}`, sh: `0x${string}`) {
  return keccak256(pack(["0x1901", ds, sh]) as any);
}

const dsManual = ozDomainSeparator(probe);
const shManual = ozStructHash();
const digestA = toTypedDataHash(dsManual, shManual);

// ---- B. viem digest --------------------------------------------------
const types = {
  Approval: [
    { name: "releaseId", type: "bytes32" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
const message = { releaseId: anchor, decision: decision as const, nonce, deadline };
const digestB = await hashTypedData({ domain: { name: "FirmwareCouncil", version: "1", chainId, verifyingContract: probe }, types, primaryType: "Approval" as const, message });

console.log("manual ds :", dsManual);
console.log("manual sh :", shManual);
console.log("digestA(manual typed-data):", digestA);
console.log("digestB(viem typed-data)  :", digestB, digestA === digestB ? "MATCH" : "MISMATCH");

// ---- C. sign with viem, recover over both digests --------------------
const sigViem = await signer.signTypedData({ domain: { name: "FirmwareCouncil", version: "1", chainId, verifyingContract: probe }, types, primaryType: "Approval" as const, message });
const recA = await recoverAddress({ data: digestA, signature: sigViem }).catch((e) => "err " + String(e).slice(0, 60));
const recB = await recoverAddress({ data: digestB, signature: sigViem }).catch((e) => "err " + String(e).slice(0, 60));
console.log("signer:", signer.address, " viem-sig recovers over A:", recA, " over B:", recB);

// ---- D. sign the RAW digest + eth_call approveRelease on the probe ---
const sigRaw = await signer.sign({ hash: digestA });
const APPROVE_ABI = [
  { type: "function", name: "approveRelease", stateMutability: "nonpayable", inputs: [
    { name: "releaseId", type: "bytes32" }, { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
    { name: "signature", type: "bytes" },
  ], outputs: [] },
] as const;
const data = encodeFunctionData({ abi: APPROVE_ABI, functionName: "approveRelease", args: [anchor, decision, nonce, deadline, sigRaw] });
const sim = await pub.call({ to: governance, data, account: signer.address })
  .then(() => "OK governance accepts raw-digest sig")
  .catch((e) => "governance revert: " + String(e?.details ?? e).slice(0, 110));
console.log(sim);
