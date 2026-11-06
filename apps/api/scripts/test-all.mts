/**
 * Test-suite orchestrator for the backend contract (@fc/api).
 * Runs the full end-to-end governance harness (which reseeds itself)
 * and reports PASS/FAIL honestly per suite.
 *
 * Run: node --import tsx apps/api/scripts/test-all.mts   (root: npm run test:api)
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const HERE = dirname(fileURLToPath(import.meta.url));

const suites: Array<{ name: string; script: string; args?: string[] }> = [
  { name: "Governance end-to-end (governance state machine incl. canary, rollout, incidents, revocation, audit chain)", script: resolve(HERE, "e2e.mts") },
];

let failed = false;
for (const suite of suites) {
  console.log(`\n=== ${suite.name} ===\n`);
  const res = spawnSync(process.execPath, ["--import", "tsx", suite.script], {
    stdio: "inherit",
    env: process.env,
    cwd: resolve(HERE, "../.."),
  });
  if (res.status !== 0) {
    console.error(`\n[FAIL] ${suite.name} (exit ${res.status ?? "signal"})`);
    failed = true;
  } else {
    console.log(`\n[PASS] ${suite.name}`);
  }
}

console.log(failed ? "\nRESULT: FAIL — one or more suites failed" : "\nRESULT: PASS");
process.exit(failed ? 1 : 0);
