/**
 * Manual probe: encode one RELEASE_PROPOSED calldata exactly like the mirror
 * does, simulate it with eth_call / estimateGas against the live testnet node,
 * and print the RAW RPC error so we can see which argument the node rejects.
 */
import { createPublicClient, createWalletClient, http, encodeFunctionData, keccak256, toHex, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chainId = Number(process.env.GOV_CHAIN_ID ?? 968);
const rpc = process.env.GOV_RPC_URL ?? "https://rpc.bohr.life";
const contract = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;
const key = (process.env.GOV_PRIVATE_KEY ?? "") as `0x${string}`;

const chain = { id: chainId, name: "bot", nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;

const h = (x: string) => keccak256(toHex(x) as `0x${string}`);

const ABI = parseAbi([
  "function proposeRelease(bytes32,bytes32,bytes32)",
  "function openCanary(bytes32,bytes32)",
  "function authoriseRollout(bytes32)",
  "function advanceRollout(bytes32,uint8)",
]);

const data = encodeFunctionData({
  abi: ABI,
  functionName: "proposeRelease",
  args: [h("pl-1"), h("3.5.0-mx1uv"), h("sha256:abc123")],
});
console.log("calldata:", data);

const account = privateKeyToAccount(key);
console.log("from:", account.address, "to:", contract);

// 1) The exact params viem would send for estimateGas
const estimateParams = { from: account.address, to: contract, data };
const res = await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "eth_estimateGas", params: [estimateParams],
  }),
});
console.log("eth_estimateGas raw:", await res.text());

// 2) eth_call as a simpler simulation
const res2 = await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_call", params: [estimateParams, "latest"] }),
});
console.log("eth_call raw:", await res2.text());

// 3) Sanity: does the node even accept a plain ETH transfer-shaped estimate?
const res3 = await fetch(rpc, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "eth_estimateGas", params: [{ from: account.address, to: contract }] }),
});
console.log("plain transfer estimate raw:", await res3.text());
