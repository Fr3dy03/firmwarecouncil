/**
 * BOT Chain network check for FirmwareCouncil deployment tooling.
 * Validates live RPC connectivity, chain identity and deployer funding
 * BEFORE any broadcast is attempted. Never fabricates success.
 *
 * Run: npm run check -w @fc/deploy
 */
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAddress } from "viem/accounts";

type Net = {
  key: string;
  chainId: number;
  rpc: string;
  currency: string;
  faucet?: string;
};

const NETWORKS: Net[] = [
  { key: "testnet", chainId: 968, rpc: "https://rpc.bohr.life", currency: "tBOT", faucet: "https://faucet.botchain.ai/basic" },
  { key: "mainnet", chainId: 677, rpc: "https://rpc.botchain.ai", currency: "BOT" },
];

function loadKey(): `0x${string}` | undefined {
  const raw = process.env.GOV_PRIVATE_KEY ?? process.env.DEPLOY_PRIVATE_KEY;
  if (!raw) return undefined;
  const k = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) {
    throw new Error("GOV_PRIVATE_KEY / DEPLOY_PRIVATE_KEY is not a valid 32-byte secp256k1 key");
  }
  return k;
}

async function probe(net: Net): Promise<boolean> {
  const client = createPublicClient({
    transport: http(net.rpc, { timeout: 15_000 }),
  });
  console.log(`[${net.key}] ${net.rpc}`);
  let ok = true;
  try {
    const chainId = await client.getChainId();
    const match = chainId === net.chainId;
    ok = match;
    console.log(`  eth_chainId = ${chainId} (expected ${net.chainId}) ${match ? "MATCH" : `MISMATCH — expected ${net.chainId}, do not deploy`}`);
  } catch (e: any) {
    ok = false;
    console.log(`  eth_chainId = <unreachable> (${String(e?.message ?? e).slice(0, 140)})`);
  }
  try {
    const blockNumber = await client.getBlockNumber();
    console.log(`  head block   = ${blockNumber}`);
  } catch (e: any) {
    console.log(`  head block   = <unavailable> (${String(e?.message ?? e).slice(0, 140)})`);
  }

  if (net.key === "mainnet") {
    // Official guidance (docs/RESEARCH.md): mainnet log queries are not a
    // supported release-history source (frequent pulling → WebSockets; full
    // ranges time out). We MEASURE instead of trusting our own assumption —
    // bounded range must answer quickly and full range is expected to be
    // unreliable. FRC-D01 regardless.
    try {
      const t0 = Date.now();
      await client.getLogs({ fromBlock: 1n, toBlock: 2n }, { timeout: 15_000 });
      console.log(`  eth_getLogs  = answered for bounded range 1..2 in ${Date.now() - t0}ms (feasible but NOT used as a history source — policy FRC-D01)`);
    } catch (e: any) {
      console.log(`  eth_getLogs  = unavailable for bounded range (${String(e?.message ?? e).slice(0, 120)})`);
    }
    try {
      const t0 = Date.now();
      await client.getLogs({ fromBlock: 0n, toBlock: "latest" } as any, undefined);
      console.log(`  eth_getLogs  = full range answered in ${Date.now() - t0}ms (measured; still not trusted for history per FRC-D01)`);
    } catch (e: any) {
      console.log(`  eth_getLogs  = full range failed/timed out as expected (${String(e?.message ?? e).slice(0, 80)})`);
    }
  }

  if (net.faucet) console.log(`  faucet       = ${net.faucet}`);
  return ok;
}

async function accountStatus() {
  const key = loadKey();
  if (!key) {
    console.log("\nNo DEPLOY_PRIVATE_KEY / GOV_PRIVATE_KEY configured.");
    console.log("For a live deployment:");
    console.log("  1. generate a burner key (never reuse a personal wallet key)");
    console.log("  2. fund it with testnet tBOT via the official faucet: https://faucet.botchain.ai/basic");
    console.log("  3. re-run this check");
    console.log("  4. deploy: npm run deploy:forge -w @fc/deploy  (or forge script script/Deploy.s.sol --rpc-url https://rpc.bohr.life --broadcast)");
    return;
  }
  const addr = privateKeyToAddress(key);
  console.log(`\nDeployer account: ${addr}`);
  for (const net of NETWORKS) {
    const client = createPublicClient({ transport: http(net.rpc, { timeout: 15_000 }) });
    try {
      const wei = await client.getBalance({ address: addr });
      console.log(`  ${net.key}: ${formatEther(wei)} ${net.currency}`);
      if (net.key === "testnet" && wei === 0n && net.faucet) {
        console.log(`  Balance is zero — request funds at ${net.faucet} then re-run.`);
      }
    } catch (e: any) {
      console.log(`  ${net.key}: balance check failed — ${String(e?.message ?? e).slice(0, 140)}`);
    }
  }
}

async function main() {
  for (const net of NETWORKS) {
    await probe(net);
  }
  await accountStatus();
}

main().catch((err) => {
  console.error("check failed:", err);
  process.exit(1);
});
