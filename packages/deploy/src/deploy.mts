/**
 * viem-based deployment of ReleaseGovernance onto BOT Chain.
 *
 * Prefers `forge` (forge script script/Deploy.s.sol) for production builds —
 * this script is the programmable equivalent for CI harnesses. It reads the
 * compiled artifact produced by `forge build` in packages/contracts.
 *
 * Honesty policy: if the RPC rejects the broadcast (e.g. unfunded deployer),
 * the script exits non-zero with the exact upstream error. It never reports
 * a fabricated address and never pretends a broadcast happened.
 *
 * Required env:
 *   GOV_PRIVATE_KEY (or DEPLOY_PRIVATE_KEY) — burner key, funded:
 *       testnet tBOT via https://faucet.botchain.ai/basic
 * Optional env:
 *   DEPLOY_NETWORK   "testnet" (default 968 via rpc.bohr.life) | "mainnet" (677 via rpc.botchain.ai)
 *   GOV_MANUFACTURER / GOV_SECURITY_REVIEWER / GOV_OPERATOR / GOV_EMERGENCY_ADMIN
 *     — explicit governance role addresses; defaults derive the deployer-side
 *       EOA addresses deterministically (same policy as the Foundry script).
 *   GOV_BACKEND_MANUFACTURER_VALIDATOR / ..._SECURITY_VALIDATOR / ..._OPERATOR_VALIDATOR
 *     — backend keyring addresses registered as contract signers post-deploy.
 *
 * Run: npm run deploy -w @fc/deploy    (after: cd contracts && forge build)
 */
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex } from "viem";
import { privateKeyToAddress, privateKeyToAccount } from "viem/accounts";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

function network() {
  const which = process.env.DEPLOY_NETWORK ?? "testnet";
  if (which !== "testnet" && which !== "mainnet") {
    throw new Error(`DEPLOY_NETWORK must be "testnet" or "mainnet", got "${which}"`);
  }
  if (which === "mainnet") {
    throw new Error("Refusing to target mainnet (677) from CI harnesses by default — deploy mainnet deliberately with forge using the documented runbook (docs/DEPLOYMENT_RUNBOOK section in docs/ARCHITECTURE.md).");
  }
  return defineChain({
    id: 968,
    name: "BOT Chain Testnet",
    nativeCurrency: { name: "Bohr", symbol: "tBOT", decimals: 18 },
    rpcUrls: { default: { http: ["https://rpc.bohr.life"] } },
    blockExplorers: { default: { name: "BOT Scan", url: "https://scan.bohr.life/" } },
  });
}

function loadKey(): `0x${string}` {
  const raw = process.env.GOV_PRIVATE_KEY ?? process.env.DEPLOY_PRIVATE_KEY;
  if (!raw) {
    throw new Error(
      "No GOV_PRIVATE_KEY / DEPLOY_PRIVATE_KEY configured. This deploy intentionally does nothing without a funded key.\n" +
        "1. generate a burner key\n2. fund it: https://faucet.botchain.ai/basic\n3. re-run",
    );
  }
  const k = (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(k)) throw new Error("deploy key is not a valid 32-byte hex private key");
  return k;
}

function loadArtifact(): { abi: readonly unknown[]; bytecode: `0x${string}` } {
  const p = resolve(HERE, "../../../contracts/out/ReleaseGovernance.sol/ReleaseGovernance.json");
  if (!existsSync(p)) {
    throw new Error(`Compile artifact missing (${p}). Run: cd contracts && forge build --root contracts`);
  }
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const abi = raw.abi;
  const object = raw?.bytecode?.object as string | undefined;
  if (!Array.isArray(abi) || !object?.startsWith("0x")) {
    throw new Error("Artifact format unexpected — verify forge build output for ReleaseGovernance.json");
  }
  return { abi: abi as readonly unknown[], bytecode: object as `0x${string}` };
}

function defaultRoleAddress(label: string, fallbackKey: `0x${string}`): `0x${string}` {
  const env = process.env[label];
  if (env) return (env.startsWith("0x") ? env : `0x${env}`) as `0x${string}`;
  return privateKeyToAddress(keccak256(toHex(label)) as `0x${string}`) ?? privateKeyToAddress(fallbackKey);
}

async function main() {
  const chain = network();
  const key = loadKey();
  const { abi, bytecode } = loadArtifact();

  const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
  const walletClient = createWalletClient({
    chain,
    transport: http(chain.rpcUrls.default.http[0]),
    account: privateKeyToAccount(key),
  });

  const deployer = walletClient.account.address;
  const gasPrice = (await publicClient.getGasPrice()) ?? 0n;
  const balance = await publicClient.getBalance({ address: deployer });
  console.log(`Network  : ${chain.name} (${chain.id}) via ${chain.rpcUrls.default.http[0]}`);
  console.log(`Deployer : ${deployer} — balance ${(Number(balance) / 1e18).toFixed(6)} ${chain.nativeCurrency.symbol}`);
  if (balance === 0n) {
    throw new Error("Deployer has zero balance. Fund it via https://faucet.botchain.ai/basic and re-run. Nothing was broadcast.");
  }

  // Constructor: (manufacturer, securityReviewer, operator, emergencyAdmin)
  const manufacturer = defaultRoleAddress("GOV_MANUFACTURER", key);
  const securityReviewer = defaultRoleAddress("GOV_SECURITY_REVIEWER", key);
  const operator = defaultRoleAddress("GOV_OPERATOR", key);
  const emergencyAdmin = defaultRoleAddress("GOV_EMERGENCY_ADMIN", key);
  console.log("Roles    :");
  console.log(`  MANUFACTURER        ${manufacturer}`);
  console.log(`  SECURITY_REVIEWER   ${securityReviewer}`);
  console.log(`  OPERATOR            ${operator}`);
  console.log(`  EMERGENCY_ADMIN     ${emergencyAdmin}`);

  console.log("Broadcasting deployment…");
  const hash = await walletClient.deployContract({
    abi: abi as any,
    bytecode,
    args: [manufacturer, securityReviewer, operator, emergencyAdmin],
    gasPrice: gasPrice ? gasPrice * 12n / 10n : undefined,
  });
  console.log(`tx hash  : ${hash}`);
  const explorer = chain.blockExplorers?.default.url ?? "";
  if (explorer) console.log(`explorer : ${explorer}tx/${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
  if (receipt.status !== "success") {
    throw new Error(`Deployment reverted on chain (status=${receipt.status}). See ${explorer}tx/${hash}`);
  }
  const address = receipt.contractAddress;
  if (!address) throw new Error("Receipt had no contractAddress — verify explorer manually.");
  console.log(`\nReleaseGovernance deployed at: ${address}`);

  const backendSigners: Array<[string, string]> = [
    ["GOV_BACKEND_MANUFACTURER_VALIDATOR", "MANUFACTURER_ROLE"],
    ["GOV_BACKEND_SECURITY_VALIDATOR", "SECURITY_REVIEWER_ROLE"],
    ["GOV_BACKEND_OPERATOR_VALIDATOR", "OPERATOR_ROLE"],
  ];
  const roleHash = (name: string) => keccak256(toHex(name)) as `0x${string}`;
  for (const [envName, roleName] of backendSigners) {
    const addr = process.env[envName];
    if (!addr) continue;
    const normalized = (addr.startsWith("0x") ? addr : `0x${addr}`) as `0x${string}`;
    console.log(`Registering backend signer ${normalized} for ${roleName}…`);
    const sHash = await walletClient.writeContract({
      address,
      abi: abi as any,
      functionName: "registerSigner",
      args: [normalized, roleHash(roleName)],
    });
    const sReceipt = await publicClient.waitForTransactionReceipt({ hash: sHash, timeout: 90_000 });
    if (sReceipt.status !== "success") throw new Error(`registerSigner(${roleName}) reverted: ${explorer}tx/${sHash}`);
    console.log(`  confirmed: ${sHash}`);
  }

  // Post-deploy self-read: not broadcast, verified on-chain state via direct
  // contract reads (never a log indexer — FRC-D01).
  // DEFAULT_ADMIN_ROLE is 0x00 in OpenZeppelin AccessControl.
  const ZERO32 = `0x${"0".repeat(64)}` as `0x${string}`;
  const deployerIsAdmin = await publicClient.readContract({
    address,
    abi: abi as any,
    functionName: "hasRole",
    args: [ZERO32, deployer],
  }).catch(() => undefined);
  console.log(`Post-deploy self-read hasRole(DEFAULT_ADMIN_ROLE, deployer) = ${deployerIsAdmin}`);
  console.log("\nNext steps:");
  console.log(`  export GOV_CONTRACT_ADDRESS=${address}`);
  console.log("  export GOV_PRIVATE_KEY=<backend broadcaster key used above>");
  console.log("  npm run dev (the governance mirror will now broadcast real txs)");
}

main().catch((err) => {
  console.error(`\nDeployment aborted — nothing was broadcast (or the failed tx is printed above): ${err?.message ?? err}`);
  process.exit(1);
});
