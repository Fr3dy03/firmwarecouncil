/** Direct verification of contract state for the mirror's signer model. */
import { createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chainId = Number(process.env.GOV_CHAIN_ID ?? 968);
const rpc = process.env.GOV_RPC_URL ?? "https://rpc.bohr.life";
const contract = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;

const ABI = parseAbi([
  "function signerRole(address) view returns (bytes32)",
  "function consumedNonces(bytes32, address) view returns (uint256)",
  "function hasRole(bytes32 role, address) view returns (bool)",
  "function OPERATOR_ROLE() view returns (bytes32)",
  "function SECURITY_REVIEWER_ROLE() view returns (bytes32)",
  "function releases(bytes32) view returns (bytes32, bytes32, bytes32, bytes32, address, uint64, uint8)",
  "function approvalsOf(bytes32, uint256) view returns (bytes32, address, bytes32, uint8, uint64, bytes32)",
]);

const pub = createPublicClient({ transport: http(rpc) });
const sec = privateKeyToAccount((process.env.GOV_SECURITY_SIGNER_KEY ?? "") as `0x${string}`);
const opr = privateKeyToAccount((process.env.GOV_OPERATOR_SIGNER_KEY ?? "") as `0x${string}`);
const bk = privateKeyToAccount((process.env.GOV_PRIVATE_KEY ?? "") as `0x${string}`);
const anchor = "0x17bba97aae88649ea9c057cdf11bc9999036e45f3012c0c48f03ff739c2138f5" as `0x${string}`;

const signerRoleSec = await pub.readContract({ address: contract, abi: ABI, functionName: "signerRole", args: [sec.address] });
const signerRoleOpr = await pub.readContract({ address: contract, abi: ABI, functionName: "signerRole", args: [opr.address] });
const [roleOp, roleSec] = await Promise.all([
  pub.readContract({ address: contract, abi: ABI, functionName: "OPERATOR_ROLE" }),
  pub.readContract({ address: contract, abi: ABI, functionName: "SECURITY_REVIEWER_ROLE" }),
]);
console.log("signerRole[security]:", signerRoleSec, "expected:", roleSec, signerRoleSec === roleSec);
console.log("signerRole[operator]:", signerRoleOpr, "expected:", roleOp, signerRoleOpr === roleOp);

const rel = await pub.readContract({ address: contract, abi: ABI, functionName: "releases", args: [anchor] });
console.log("release anchor state:", JSON.stringify(rel, (_, v) => typeof v === "bigint" ? v.toString() : v));

const consumedS = await pub.readContract({ address: contract, abi: ABI, functionName: "consumedNonces", args: [anchor, sec.address] });
const consumedO = await pub.readContract({ address: contract, abi: ABI, functionName: "consumedNonces", args: [anchor, opr.address] });
console.log("consumedNonces security:", consumedS, "operator:", consumedO);

const b0 = await pub.readContract({ address: contract, abi: ABI, functionName: "approvalsOf", args: [anchor, 0n] }).catch(() => null);
console.log("approval[0]:", b0 ? Array.from(b0 as any).map((v: any) => typeof v === "bigint" ? v.toString() : v) : "(none yet)");
