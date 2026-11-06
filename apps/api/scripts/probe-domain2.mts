/**
 * Deploy ProbeDomain (same OZ EIP712 base, name="FirmwareCouncil", version="1")
 * and bisect the approval signature failure:
 *   1. probe.domainSeparator()   vs JS-computed OZ formula
 *   2. probe.structHash(...)     vs JS-computed
 *   3. probe.recover(sh, sig)    (signed by viem with the same domain)
 *   4. ReleaseGovernance.approveRelease  under the SAME params via eth_call
 */
import { createPublicClient, createWalletClient, http, defineChain, encodeFunctionData, keccak256, toHex, concat, toHex as th, parseAbi, toBytes, pad, numberToHex, size } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const chainId = Number(process.env.GOV_CHAIN_ID ?? 968);
const rpc = process.env.GOV_RPC_URL ?? "https://rpc.bohr.life";
const governance = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const bKey = (process.env.GOV_PRIVATE_KEY ?? "") as `0x${string}`;
const secKey = (process.env.GOV_SECURITY_SIGNER_KEY ?? "") as `0x${string}`;
const anchor = "0x17bba97aae88649ea9c057cdf11bc9999036e45f3012c0c48f03ff739c2138f5" as `0x${string}`;
const nonce = 1n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

const chain = defineChain({ id: chainId, name: "bot", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } });
const pub = createPublicClient({ chain, transport: http(rpc) });
const account = privateKeyToAccount(bKey);
const signer = privateKeyToAccount(secKey);
const wallet = createWalletClient({ chain, transport: http(rpc), account });

const artifactPath = resolve(HERE, "../../../contracts/out/ProbeDomain.sol/ProbeDomain.json");
const raw = JSON.parse(readFileSync(artifactPath, "utf8"));
const abi = raw.abi as any;

// 1. deploy probe
const hash = await wallet.deployContract({ abi, bytecode: raw.bytecode.object, args: ["FirmwareCouncil", "1"] });
const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60_000 });
const probe = receipt.contractAddress as `0x${string}`;
console.log("ProbeDomain at:", probe, "block", receipt.blockNumber);

// 2. JS-computed pieces (OZ formula)
const TYPE_DOMAIN = keccak256(new TextEncoder().encode("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)") as any);
const hashedName = keccak256(new TextEncoder().encode("FirmwareCouncil") as any);
const hashedVersion = keccak256(new TextEncoder().encode("1") as any);
const w = (x: bigint | number) => ("0x" + x.toString(16).padStart(64, "0")) as `0x${string}`;
const pack = (arr: string[]) => {
  let out = "0x" as string;
  for (const a of arr) out += a.replace(/^0x/, "");
  return out as `0x${string}`;
};
const jsDomainSeparator = keccak256(pack([
  TYPE_DOMAIN, hashedName, hashedVersion, w(BigInt(chainId)), "0x" + BigInt(probe).toString(16).padStart(64, "0"),
]) as any);
const APPROVAL_TYPEHASH = keccak256(new TextEncoder().encode("Approval(bytes32 releaseId,uint8 decision,uint256 nonce,uint256 deadline)") as any);
const jsStructHash = keccak256(pack([APPROVAL_TYPEHASH, anchor, w(0n), w(nonce), w(deadline)]) as any);

const onChainDs = await pub.readContract({ address: probe, abi, functionName: "domainSeparator" });
const onChainSh = await pub.readContract({ address: probe, abi, functionName: "structHash", args: [anchor, 0, nonce, deadline] });
console.log("domainSeparator js   :", jsDomainSeparator);
console.log("domainSeparator chain:", onChainDs, onChainDs === jsDomainSeparator ? "MATCH" : "MISMATCH");
console.log("structHash       js  :", jsStructHash);
console.log("structHash       chain:", onChainSh, onChainSh === jsStructHash ? "MATCH" : "MISMATCH");

// 3. sign with viem over the same domain and let the probe recover it
const types = {
  Approval: [
    { name: "releaseId", type: "bytes32" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
const message = { releaseId: anchor, decision: 0 as const, nonce, deadline };
const sig = await signer.signTypedData({ name: "FirmwareCouncil", version: "1", chainId, verifyingContract: probe, types, primaryType: "Approval" as const, message });
const recovered = await pub.readContract({ address: probe, abi, functionName: "recover", args: [onChainSh, sig] }).catch((e) => `revert: ${String(e?.details ?? e).slice(0, 100)}`);
console.log("probe recover of viem sig:", recovered, "signer:", signer.address);

// 4. same params against RELEASE GOVERNANCE (probe domain ≠ governance address, so only
//    digest consistency is being checked here — governance uses its own verifyingContract)
const approved = await pub.readContract({
  address: probe, abi,
  functionName: "digest",
  args: [onChainDs, onChainSh],
}).catch(() => null);
console.log("probe digest join:", approved);
