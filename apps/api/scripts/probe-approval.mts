/**
 * Probe: reproduce the mirrored approveRelease signature path step by step.
 * 1. sign the EIP-712 Approval with the security signer (same code as the mirror)
 * 2. verifyTypedData locally (does viem recover the same signer?)
 * 3. eth_call approveRelease on the live contract (same params as send)
 * 4. eth_call consumedNonces(signer) and hasDecision-ish state for sanity
 */
import { createPublicClient, createWalletClient, http, defineChain, toHex, keccak256, encodeFunctionData, decodeErrorResult } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chainId = Number(process.env.GOV_CHAIN_ID ?? 968);
const rpc = process.env.GOV_RPC_URL ?? "https://rpc.bohr.life";
const contract = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const secKey = (process.env.GOV_SECURITY_SIGNER_KEY ?? "") as `0x${string}`;
const broadcasterKey = (process.env.GOV_PRIVATE_KEY ?? "") as `0x${string}`;

const chain = { id: chainId, name: "bot", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
const pub = createPublicClient({ chain, transport: http(rpc) });
const signer = privateKeyToAccount(secKey);
const broadcaster = privateKeyToAccount(broadcasterKey);

// The chain anchor we recorded from the CONFIRMED RELEASE_PROPOSED receipt
const anchor = ("0x" + process.argv[2]?.replace(/^0x/, "") ?? "") as `0x${string}`;
if (!/^0x[0-9a-fA-F]{64}$/.test(anchor)) { console.error("usage: probe-approval.mts <chainReleaseId32>"); process.exit(1); }

const APPROVAL_ABI = [
  { type: "function", name: "approveRelease", stateMutability: "nonpayable", inputs: [
    { name: "releaseId", type: "bytes32" }, { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
    { name: "signature", type: "bytes" },
  ], outputs: [{ name: "sigDigest", type: "bytes32" }] },
  { type: "function", name: "consumedNonces", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const domain = { name: "FirmwareCouncil", version: "1", chainId, verifyingContract: contract };
const types = {
  Approval: [
    { name: "releaseId", type: "bytes32" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

const nonce = ((await pub.readContract({ address: contract, abi: APPROVAL_ABI, functionName: "consumedNonces", args: [anchor, signer.address] })) as bigint) + 1n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
const message = { releaseId: anchor, decision: 0 as const, nonce, deadline };

const signature = await signer.signTypedData({ ...domain, types, primaryType: "Approval" as const, message });
console.log("signer     :", signer.address);
console.log("anchor     :", anchor);
console.log("nonce      :", nonce.toString(), " deadline:", deadline.toString());
console.log("signature  :", signature);

const { recoverTypedDataAddress } = await import("viem");
const recovered = (await recoverTypedDataAddress({ ...domain, types, primaryType: "Approval" as const, message, signature })) as any;
console.log("local recovered:", recovered);

// ...then eth_call approveRelease under candidate domains until one validates
const args = [anchor, 0 as const, nonce, deadline, signature] as const;
const variants: Array<[string, any]> = [
  ["default(name,version,chainId,verContract)", domain],
  ["no chainId", { name: "FirmwareCouncil", version: "1", verifyingContract: contract }],
  ["no version", { name: "FirmwareCouncil", chainId, verifyingContract: contract }],
  ["name only + chainId", { name: "FirmwareCouncil", version: "1", chainId: 968, verifyingContract: contract }],
];
for (const [label, dom] of variants) {
  let signatureV = signature;
  try {
    signatureV = await signer.signTypedData({ ...dom, types, primaryType: "Approval" as const, message });
  } catch (e) { console.log(label, "sign fail", (e as Error).message); continue; }
  try {
    const data2 = encodeFunctionData({ abi: APPROVAL_ABI, functionName: "approveRelease", args: [args[0], args[1], args[2], args[3], signatureV] });
    const sim = await pub.call({ account: broadcaster.address, to: contract, data: data2 });
    console.log("✓ DOMAIN WORKS:", label, "sigDigest(simulated):", sim.data);
    break;
  } catch (err: any) {
    console.log(label, "→ revert:", String(err?.details ?? err?.message).slice(0, 100));
  }
}

// relay broadcast from the broadcaster (same as the mirror does)
const data = encodeFunctionData({ abi: APPROVAL_ABI, functionName: "approveRelease", args: [anchor, 0, nonce, deadline, signature] });
console.log("calldata selector:", data.slice(0, 10), "len:", data.length);

const res = await pub.call({ account: broadcaster.address, to: contract, data }).catch((err: any) => {
  console.log("eth_call reverted with err.details:", String(err?.details ?? "").slice(0, 90));
  return null;
});
if (res) console.log("default-domain eth_call SUCCEEDED:", res.data);
