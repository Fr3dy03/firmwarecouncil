/** Scan the deployed bytecode for keccak constants of candidate EIP-712 typehash strings. */
import { createPublicClient, http, keccak256 } from "viem";

const pub = createPublicClient({ transport: http(process.env.GOV_RPC_URL ?? "https://rpc.bohr.life") });
const code: string = (await pub.getBytecode({ address: (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}` }))?.replace(/^0x/, "") || console.error("no code") || "";

const candidates = [
  "Approval(bytes32 releaseId,uint8 decision,uint256 nonce,uint256 deadline)",
  "Approval(bytes32 releaseId,uint8 decision,uint64 nonce,uint256 deadline)",
  "Approval(bytes32 releaseId,uint8 decision,uint256 nonce,uint64 deadline)",
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)",
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)",
];

for (const c of candidates) {
  const h = keccak256(new TextEncoder().encode(c) as any).slice(2).toLowerCase();
  const present = code.includes(h);
  console.log((present ? "FOUND   " : "absent  "), h, " <-", c);
}
