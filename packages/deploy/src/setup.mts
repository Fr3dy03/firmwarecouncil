/**
 * One-time on-chain role setup for the FirmwareCouncil backend mirror.
 *
 * The burner broadcaster (GOV_PRIVATE_KEY) holds DEFAULT_ADMIN_ROLE, but the
 * mirror also needs to act as MANUFACTURER (propose / register product lines)
 * and OPERATOR (canary + rollout progression). Decision approvals are EIP-712
 * signatures from dedicated relay signers (see docs/SECURITY_MODEL.md):
 *
 *   GOV_PRIVATE_KEY            — broadcaster + admin + MANUFACTURER/OPERATOR roles
 *   GOV_OPERATOR_SIGNER_KEY    — signs operator decision approvals (relayed, unfunded)
 *   GOV_SECURITY_SIGNER_KEY    — signs security decision approvals (relayed, unfunded)
 *
 * Honesty policy: prints every tx hash; exits non-zero if anything fails.
 * Run: node --env-file=.env --import tsx packages/deploy/src/setup.mts
 */
import { createPublicClient, createWalletClient, defineChain, http, keccak256, toHex, encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const chain = defineChain({
  id: Number(process.env.GOV_CHAIN_ID ?? 968),
  name: process.env.GOV_CHAIN_ID === "677" ? "BOT Chain" : "BOT Chain Testnet",
  nativeCurrency: { name: "BOT", symbol: "BOT", decimals: 18 },
  rpcUrls: { default: { http: [process.env.GOV_RPC_URL ?? "https://rpc.bohr.life"] } },
});

const ADMIN_ABI = parseAbi([
  "function grantRole(bytes32 role, address account)",
  "function registerSigner(address signer, bytes32 role)",
  "function hasRole(bytes32 role, address account) view returns (bool)",
  "function signerRole(address signer) view returns (bytes32)",
  "function DEFAULT_ADMIN_ROLE() view returns (bytes32)",
  "function MANUFACTURER_ROLE() view returns (bytes32)",
  "function OPERATOR_ROLE() view returns (bytes32)",
  "function SECURITY_REVIEWER_ROLE() view returns (bytes32)",
]);

function key(name: string): `0x${string}` {
  const raw = process.env[name];
  if (!raw || !/^0x[0-9a-fA-F]{64}$/.test(raw.startsWith("0x") ? raw : `0x${raw}`)) {
    throw new Error(`${name} missing or not a 32-byte hex key`);
  }
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

async function main() {
  const contract = (process.env.GOV_CONTRACT_ADDRESS ?? "") as `0x${string}`;
  if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) throw new Error("GOV_CONTRACT_ADDRESS not configured");

  const adminKey = key("GOV_PRIVATE_KEY");
  const operatorKey = process.env.GOV_OPERATOR_SIGNER_KEY ? key("GOV_OPERATOR_SIGNER_KEY") : undefined;
  const securityKey = process.env.GOV_SECURITY_SIGNER_KEY ? key("GOV_SECURITY_SIGNER_KEY") : undefined;

  const account = privateKeyToAccount(adminKey);
  const wallet = createWalletClient({ chain, transport: http(chain.rpcUrls.default.http[0]), account });
  const pub = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
  const [deployer, MANUFACTURER, OPERATOR, SECURITY, DEFAULT_ADMIN] = await Promise.all([
    pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "DEFAULT_ADMIN_ROLE" }),
    pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "MANUFACTURER_ROLE" }),
    pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "OPERATOR_ROLE" }),
    pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "SECURITY_REVIEWER_ROLE" }),
    Promise.resolve(keccak256(toHex("DEFAULT_ADMIN_ROLE")) as `0x${string}`),
  ]);
  const DEFAULT_ADMIN = deployer; // OpenZeppelin's DEFAULT_ADMIN_ROLE constant is bytes32(0), read from chain above

  const broadcaster = account.address;
  console.log("Contract     :", contract);
  console.log("Broadcaster  :", broadcaster);

  type Job = { label: string; check: () => Promise<boolean>; run: () => Promise<`0x${string}`> };
  const jobs: Job[] = [
    {
      label: `MANUFACTURER_ROLE   → broadcaster`,
      check: () => pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "hasRole", args: [MANUFACTURER, broadcaster] }),
      run: () => wallet.writeContract({ address: contract, abi: ADMIN_ABI, functionName: "grantRole", args: [MANUFACTURER, broadcaster] }),
    },
    {
      label: `OPERATOR_ROLE       → broadcaster`,
      check: () => pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "hasRole", args: [OPERATOR, broadcaster] }),
      run: () => wallet.writeContract({ address: contract, abi: ADMIN_ABI, functionName: "grantRole", args: [OPERATOR, broadcaster] }),
    },
  ];
  if (operatorKey) {
    const addr = privateKeyToAccount(operatorKey).address;
    jobs.push({
      label: `OPERATOR signer     → ${addr}`,
      check: () => pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "signerRole", args: [addr] }).then((r) => r === OPERATOR),
      run: () => wallet.writeContract({ address: contract, abi: ADMIN_ABI, functionName: "registerSigner", args: [addr, OPERATOR] }),
    });
  }
  if (securityKey) {
    const addr = privateKeyToAccount(securityKey).address;
    jobs.push({
      label: `SECURITY signer     → ${addr}`,
      check: () => pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "signerRole", args: [addr] }).then((r) => r === SECURITY),
      run: () => wallet.writeContract({ address: contract, abi: ADMIN_ABI, functionName: "registerSigner", args: [addr, SECURITY] }),
    });
  }

  for (const job of jobs) {
    if (await job.check().catch(() => false)) {
      console.log(`✓ already configured: ${job.label}`);
      continue;
    }
    console.log(`broadcasting: ${job.label} …`);
    const hash = await job.run();
    console.log(`  tx ${hash}`);
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== "success") throw new Error(`${job.label} reverted`);
    console.log(`  confirmed in block ${receipt.blockNumber}`);
  }

  // Final verification pass
  const results = await Promise.all([
    pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "hasRole", args: [MANUFACTURER, broadcaster] }),
    pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "hasRole", args: [OPERATOR, broadcaster] }),
    pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "hasRole", args: [DEFAULT_ADMIN, broadcaster] }),    operatorKey ? pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "signerRole", args: [privateKeyToAccount(operatorKey).address] }) : Promise.resolve(null),
    securityKey ? pub.readContract({ address: contract, abi: ADMIN_ABI, functionName: "signerRole", args: [privateKeyToAccount(securityKey).address] }) : Promise.resolve(null),
  ]);
  const [mfr, opr, adm, opSigner, secSigner] = results as boolean[];
  console.log("\nVerification:");
  console.log(`  broadcaster hasRole(MANUFACTURER)      : ${mfr}`);
  console.log(`  broadcaster hasRole(OPERATOR)          : ${opr}`);
  console.log(`  broadcaster hasRole(DEFAULT_ADMIN)     : ${adm}`);
  if (operatorKey) console.log(`  operator signer registered as OPERATOR : ${opSigner === OPERATOR}`);
  if (securityKey) console.log(`  security signer registered as SECURITY : ${secSigner === SECURITY}`);

  if (!mfr || !opr || (operatorKey && opSigner !== OPERATOR) || (securityKey && secSigner !== SECURITY)) {
    throw new Error("role setup incomplete — see errors above");
  }
  console.log("\nRole setup complete. The governance mirror can now broadcast all workflow events.");
}

main().catch((err) => {
  console.error(err?.message ?? err);
  process.exit(1);
});
