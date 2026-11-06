/**
 * Replicate blockchain.mts's exact approveRelease signing path for the
 * GOVERNANCE contract (not the probe) and eth_call it. If this validates,
 * the signing math is right and the failure is run-context.
 */
import { keccak256, encodeFunctionData, recoverAddress, concat, hashTypedData, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chainId = Number(process.env.GOV_CHAIN_ID ?? 968);
const rpc = process.env.GOV_RPC_URL ?? "https://rpc.bohr.life";
const governance = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const secKey = (process.env.GOV_SECURITY_SIGNER_KEY ?? "") as `0x${string}`;
const anchor = "0x17bba97aae88649ea9c057cdf11bc9999036e45f3012c0c48f03ff739c2138f5" as `0x${string}`;
const signer = privateKeyToAccount(secKey);

const EIP712_DOMAIN = { name: "FirmwareCouncil", version: "1" };
const EIP712_TYPES = {
  Approval: [
    { name: "releaseId", type: "bytes32" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

const decision = 0;
const nonce = 1n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

const message = { releaseId: anchor, decision: decision as const, nonce, deadline };
const signature = await (async () => {
  const acct = signer as any;
  return acct.signTypedData({
    ...EIP712_DOMAIN,
    chainId,
    verifyingContract: governance,
    types: EIP712_TYPES,
    primaryType: "Approval" as const,
    message,
  });
})();
console.log("signature:", signature);

const digestViem = await hashTypedData({
  domain: { ...EIP712_DOMAIN, chainId, verifyingContract: governance } as any,
  types: EIP712_TYPES as any,
  primaryType: "Approval" as const,
  message: message as any,
});
const rec = await recoverAddress({ hash: digestViem as any, signature } as any).catch((e) => "recover-err: " + String(e).slice(0, 80));
console.log("viem digest:", digestViem, "recovered:", rec, "signer:", signer.address, rec === signer.address ? "MATCH" : "MISMATCH");

const APPROVE_ABI = [
  { type: "function", name: "approveRelease", stateMutability: "nonpayable", inputs: [
    { name: "releaseId", type: "bytes32" }, { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
    { name: "signature", type: "bytes" },
  ], outputs: [{ name: "sigDigest", type: "bytes32" }] },
] as const;

const pub = createPublicClient({ transport: http(rpc) });
const data = encodeFunctionData({ abi: APPROVE_ABI, functionName: "approveRelease", args: [anchor, decision, nonce, deadline, signature] });
const sim = await pub.call({ to: governance, data, account: signer.address })
  .then((r) => "✓ governance ACCEPTS (simulated sigDigest " + r.data + ")")
  .catch((e) => "✗ governance revert: " + String(e?.details ?? e).slice(0, 130));
console.log(sim);
