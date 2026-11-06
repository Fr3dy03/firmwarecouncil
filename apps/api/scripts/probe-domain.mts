/** Brute-force approveRelease domain variants against the live contract via eth_call. */
import { createPublicClient, http, defineChain, encodeFunctionData, keccak256, toHex, stringToHex, numberToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { toBeHex, zeroPadValue } from "ethers";

const chainId = Number(process.env.GOV_CHAIN_ID ?? 968);
const rpc = process.env.GOV_RPC_URL ?? "https://rpc.bohr.life";
const contract = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const secKey = (process.env.GOV_SECURITY_SIGNER_KEY ?? "") as `0x${string}`;
const bKey = (process.env.GOV_PRIVATE_KEY ?? "") as `0x${string}`;

const pub = createPublicClient({ transport: http(rpc) });
const signer = privateKeyToAccount(secKey);
const broadcaster = privateKeyToAccount(bKey);

const anchor = "0x17bba97aae88649ea9c057cdf11bc9999036e45f3012c0c48f03ff739c2138f5" as `0x${string}`;
const nonce = 1n;
const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

const types = {
  Approval: [
    { name: "releaseId", type: "bytes32" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
const message = { releaseId: anchor, decision: 0 as const, nonce, deadline };

const names = ["FirmwareCouncil", "ReleaseGovernance", "release-governance"];
const versions = ["1", "1.0", "v1"];
const chainIds = [968, 1];
const verifying = [contract];

let found: string | undefined;
outer: for (const name of names) for (const version of versions) for (const cid of chainIds) for (const vc of verifying) {
  const dom: any = { name, version, chainId: cid, verifyingContract: vc };
  let sig: string;
  try {
    sig = await signer.signTypedData({ ...dom, types, primaryType: "Approval" as const, message });
  } catch { continue; }
  try {
    const data = encodeFunctionData({
      abi: [
        { type: "function", name: "approveRelease", stateMutability: "nonpayable", inputs: [
          { type: "bytes32" }, { type: "uint8" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" },
        ], outputs: [{ type: "bytes32" }] },
      ] as any,
      functionName: "approveRelease",
      args: [anchor, 0, nonce, deadline, sig],
    });
    await pub.call({ account: broadcaster.address, to: contract, data });
    found = JSON.stringify({ name, version, chainId: cid, verifyingContract: vc });
    console.log("✓✓✓ DOMAIN WORKS:", found, "sig:", sig);
    break outer;
  } catch (err: any) {
    const d = String(err?.details ?? err?.message);
    if (!d.includes("0x0b29ce5c") && !d.includes("0xa1170f11")) {
      console.log("other revert for", name, version, cid, "→", d.slice(0, 120));
    }
  }
}
console.log(found ? "FOUND: " + found : "no domain variant validated");
