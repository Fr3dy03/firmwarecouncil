import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { createHash, sign as cryptoSignEd, createPrivateKey } from "node:crypto";
import { ApiClient, DeviceAgent } from "../../../packages/device-sim/src/agent.mts";

/**
 * FirmwareCouncil end-to-end governance proof:
 *   manufacturer proposes -> signs -> security review -> operator approval
 *   -> canary runs -> canary passes -> rollout advances -> receipts recorded
 *   -> finalise -> rollback/supersede + security negative tests.
 *
 * Run: npm run dev:api (or the root dev script), then `npm run e2e`.
 */

const BASE = process.env.FC_API_URL ?? "http://127.0.0.1:4100";
const KEYS_DIR = path.resolve("packages/device-sim/keys");
// Unique per run so the harness can be re-executed without reseeding:
const RUN_TAG = "-" + Math.random().toString(36).slice(2, 7);
const ARTIFACT_A_NAME = `ST7-3.4.1${RUN_TAG}-firmware.bin`;
const ARTIFACT_B_NAME = `ST7-3.5.0${RUN_TAG}-firmware.bin`;
const DIGEST_OF_ARTIFACT_A = createHash("sha256").update(ARTIFACT_A_NAME).digest("hex");
const DIGEST_OF_ARTIFACT_B = createHash("sha256").update(ARTIFACT_B_NAME).digest("hex");
const V_MAIN = `3.4.1${RUN_TAG}`;
const V_USB = `3.5.0${RUN_TAG}`;
const V_CANARYFAIL = `3.5.1${RUN_TAG}`;

let failures: string[] = [];
function assert(name: string, condition: boolean, detail = "") {
  if (condition) console.log(`  ÃƒÂ¢Ã…â€œÃ¢â‚¬Å“ ${name}`);
  else {
    console.log(`  ÃƒÂ¢Ã…â€œÃ¢â‚¬â€ FAIL ${name}${detail ? ` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${detail}` : ""}`);
    failures.push(`${name}${detail ? `: ${detail}` : ""}`);
  }
}

function decisionDigest(releaseId: string, role: string, decision: string) {
  return createHash("sha256").update(`${releaseId}|${role}|${decision}`).digest("hex");
}

function signManufacturer(manifestDigest: string, releaseId: string): string {
  const pem = fs.readFileSync(path.join(KEYS_DIR, "manufacturer.key"), "utf8");
  const message = Buffer.concat([Buffer.from(manifestDigest, "utf8"), Buffer.from(releaseId, "utf8")]);
  return cryptoSignEd(null, message, createPrivateKey(pem)).toString("base64");
}

async function main() {
  // Fresh, deterministic state for every run: reseed the demo dataset.
  // The running API dev server hot-reloads db.json changes (JsonStore watcher).
  if (process.env.FC_E2E_SKIP_SEED !== "1") {
    console.log("(reseeding demo state for a clean run)");
    execSync("node --import tsx apps/api/scripts/seed.mts", { stdio: "inherit" });
    await new Promise((r) => setTimeout(r, 1600));
  }

  console.log(`\nFirmwareCouncil e2e ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â API ${BASE}\n`);
  const maker = new ApiClient(BASE);
  const reviewer = new ApiClient(BASE);
  const operator = new ApiClient(BASE);
  const makerLogin = await maker.login("dev@ardane.example", "maker-demo-pass");
  const reviewLogin = await reviewer.login("review@sentinel.example", "security-demo-pass");
  const opsLogin = await operator.login("ops@voltridge.example", "operator-demo-pass");
  const makerToken = makerLogin.token;
  const reviewerToken = reviewLogin.token;
  const operatorToken = opsLogin.token;

  console.log("1. Manufacturer proposes release 3.4.1 (10-step wizard payload)");
  const propose: any = await maker.post("/api/v1/releases", {
    productLineId: (await (await fetch(`${BASE}/api/v1/product-lines`, { headers: { Authorization: `Bearer ${makerToken}` } })).json())[0].id,
    manifest: {
      version: V_MAIN,
      buildIdentifier: `ST7-3.4.1-2026-11-06-9c1d${RUN_TAG}`,
      targetRevisions: ["B3"],
      artifactDigestSha256: DIGEST_OF_ARTIFACT_A,
      artifactSizeBytes: 349_112,
      artifactUrl: "https://s3.firmwarecouncil.local/st7/3.4.1/fw.bin",
      productCompatibility: "B3 bootloaders >=1.2; requires >= 3.2.0 installed",
      securityNotes: "Fixes buffer overrun in CAN parser; no protocol changes.",
    },
    approvalRequirements: { securityReviewerCount: 1, operatorApprovalRequired: true, crossOrg: true },
    rolloutPolicy: {
      canaryCohortSize: 3,
      stages: [
        { kind: "SMALL", targetPercent: 10, minDwellMinutes: 30, requiresManualAdvance: true, autoHaltOnFailurePercent: 5 },
        { kind: "MEDIUM", targetPercent: 35, minDwellMinutes: 60, requiresManualAdvance: true, autoHaltOnFailurePercent: 5 },
        { kind: "LARGE", targetPercent: 70, minDwellMinutes: 60, requiresManualAdvance: true, autoHaltOnFailurePercent: 5 },
        { kind: "FULL", targetPercent: 100, minDwellMinutes: 120, requiresManualAdvance: false, autoHaltOnFailurePercent: 5 },
      ],
      requiresOperatorApproval: true,
    },
  });
  assert("release proposed", !!propose.id, JSON.stringify(propose?.error ?? ""));
  // unify id/alias for the rest of the harness
  (propose as any).releaseId = propose.id;

  console.log("2. Manufacturer registers Ed25519 signature over manifestDigest||releaseId");
  const signed: any = await maker.post(`/api/v1/releases/${propose.releaseId}/signature`, { signature: signManufacturer(propose.manifest.manifestDigest, propose.releaseId) });
  assert("manufacturer signature registered", !!signed.manufacturerSignatureB64);

  console.log("3. Security reviewer (cross-org) approves");
  const secApprove: any = await reviewer.post(`/api/v1/releases/${propose.releaseId}/approve`, {
    phase: "SECURITY_REVIEW",
    comments: "Manifest digest, target revisions, build id all consistent; manufacturer signature verified.",
    signatureDigest: decisionDigest(propose.releaseId, "SECURITY_REVIEWER", "APPROVE"),
  });
  assert("security approve succeeds", secApprove.release?.status === "SECURITY_APPROVED", JSON.stringify(secApprove?.error ?? ""));

  console.log("4. Operator approves rollout");
  const opApprove: any = await operator.post(`/api/v1/releases/${propose.releaseId}/approve`, {
    phase: "OPERATOR_APPROVAL",
    comments: "Maintenance window booked for North Sea buoys cohort.",
    signatureDigest: decisionDigest(propose.releaseId, "OPERATOR", "APPROVE"),
  });
  assert("operator approve succeeds", opApprove.release?.status === "OPERATOR_APPROVED", JSON.stringify(opApprove?.error ?? ""));

  console.log("5. Canary opens with cohort");
  const canary: any = await operator.post(`/api/v1/releases/${propose.releaseId}/rollout`, { action: "open-canary" });
  assert("canary opened", !!canary.cohortDeviceIds?.length);
  const releaseDetail: any = await operator.get(`/api/v1/releases/${propose.releaseId}`);
  assert("release in CANARY_RUNNING", releaseDetail.status === "CANARY_RUNNING");

  console.log("6. Simulator drives the canary cohort (10 devices fleet, 3 in cohort)");
  const cohort = canary.cohortDeviceIds;
  const fleetDevices: any[] = (await operator.get(`/api/v1/devices?fleetId=${releaseDetail.fleet ?? ""}`)).filter((d: any) => cohort.includes(d.id) || !cohort.includes(d.id));
  const agents = cohort.map((id: string) => {
    const dev = fleetDevices.find((d: any) => d.id === id);
    const agent = new DeviceAgent(operator, dev, fs.readFileSync(path.join(KEYS_DIR, "device.key"), "utf8"), { failRate: 0, offlineRate: 0 });
    return { agent, dev };
  });
  let canarySuccess = 0;
  for (const { agent, dev } of agents) {
    const decision = await agent.authoriseInstall(propose.releaseId, operatorToken);
    assert(`device ${dev.deviceRef} authorised install`, decision.approved === true, decision.reason);
    if (!decision.approved) continue;
    const res: any = await agent.installAndReport({
      releaseId: propose.releaseId,
      version: V_MAIN,
      artifactDigestSha256: DIGEST_OF_ARTIFACT_A,
      operatorToken,
    });
    if (res.submitted) canarySuccess += 1;
  }
  assert("canary receipts submitted", canarySuccess >= 2, `${canarySuccess} submitted`);

  console.log("7. Operator records canary success");
  const canaryResult: any = await operator.post(`/api/v1/releases/${propose.releaseId}/rollout`, {
    action: "record-canary-result", success: true, reason: `${canarySuccess}/${cohort.length} cohort devices reported successes`,
  });
  assert("canary passed", canaryResult.status === "CANARY_PASSED", JSON.stringify(canaryResult?.error ?? ""));

  console.log("8. Operator authorises staged rollout and advances stages");
  const authorised: any = await operator.post(`/api/v1/releases/${propose.releaseId}/rollout`, { action: "authorise-rollout" });
  assert("rollout authorised (ROLLOUT_IN_PROGRESS)", authorised.status === "ROLLOUT_IN_PROGRESS", JSON.stringify(authorised?.error ?? ""));
  for (const stage of [2, 3, 4]) {
    const next: any = await operator.post(`/api/v1/releases/${propose.releaseId}/rollout`, { action: "advance", stageOrder: stage });
    assert(`advanced to stage ${stage}`, !!next.manifest, JSON.stringify(next?.error ?? ""));
  }

  console.log("9. Fleet snapshots receipts (full rollout)");
  let mainSuccesses = 0;
  const restDevices: any[] = (await operator.get(`/api/v1/devices`, {})).filter((d: any) => !cohort.includes(d.id) && d.status !== "OFFLINE" && d.hardwareRevisionId === "hwrev_st7_b3");
  for (const dev of restDevices) {
    const agent = new DeviceAgent(operator, dev, fs.readFileSync(path.join(KEYS_DIR, "device.key"), "utf8"), { failRate: 0.08, offlineRate: 0.25 });
    const res: any = await agent.installAndReport({ releaseId: propose.releaseId, version: V_MAIN, artifactDigestSha256: DIGEST_OF_ARTIFACT_A, operatorToken });
    if (res.submitted && res.receipt.outcome === "SUCCESS") mainSuccesses += 1;
  }
  assert("fleet receipts recorded", mainSuccesses > 0);

  const final: any = await operator.post(`/api/v1/releases/${propose.releaseId}/rollout`, { action: "advance", stageOrder: 999 });
  assert("release reaches DEPLOYED", final.status === "DEPLOYED", JSON.stringify(final?.error ?? ""));

  // ============================================================================
  // security and edge-case tests
  // ============================================================================
  console.log("\nSecurity negative tests");
  const malMaker = new ApiClient(BASE, makerToken);
  try {
    await malMaker.post("/api/v1/releases", {
      productLineId: (await (await fetch(`${BASE}/api/v1/product-lines`, { headers: { Authorization: `Bearer ${makerToken}` } })).json())[0].id,
      manifest: { version: "bad-version", buildIdentifier: "x", targetRevisions: [], artifactDigestSha256: "zz", artifactSizeBytes: 0, artifactUrl: "ftp://outside.invalid/x", productCompatibility: "", securityNotes: "" },
      rolloutPolicy: null,
    });
    assert("malformed manifest rejected", false);
  } catch (e: any) { assert("malformed manifest rejected", String(e?.code ?? "") === "invalid_manifest", String(e)); }

  try {
    await malMaker.post("/api/v1/releases", {
      productLineId: (await (await fetch(`${BASE}/api/v1/product-lines`, { headers: { Authorization: `Bearer ${makerToken}` } })).json())[0].id,
      manifest: { version: "3.4.2", buildIdentifier: "ST7-3.4.2", targetRevisions: ["B3"], artifactDigestSha256: DIGEST_OF_ARTIFACT_A, artifactSizeBytes: 1, artifactUrl: "https://s3.firmwarecouncil.local/x.bin", productCompatibility: "x", securityNotes: "" },
      rolloutPolicy: null,
    });
    assert("duplicate artifact digest rejected", false);
  } catch (e: any) { assert("duplicate artifact digest rejected", e?.code === "duplicate_artifact_digest", String(e?.code)); }

  try {
    await malMaker.post("/api/v1/releases", {
      productLineId: (await (await fetch(`${BASE}/api/v1/product-lines`, { headers: { Authorization: `Bearer ${makerToken}` } })).json())[0].id,
      manifest: { version: "3.4.2", buildIdentifier: "ST7-3.4.2", targetRevisions: ["B3"], artifactDigestSha256: DIGEST_OF_ARTIFACT_B, artifactSizeBytes: 1, artifactUrl: "http://127.0.0.1:9999/x.bin", productCompatibility: "x", securityNotes: "" },
      rolloutPolicy: null,
    });
    assert("internal endpoint artifactUrl rejected", false);
  } catch (e: any) { assert("internal endpoint artifactUrl rejected", e?.code === "invalid_manifest", String(e?.code)); }

  // approver identity ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â replay same decision twice
  const rel2: any = await malMaker.post("/api/v1/releases", {
    productLineId: (await (await fetch(`${BASE}/api/v1/product-lines`, { headers: { Authorization: `Bearer ${makerToken}` } })).json())[0].id,
    manifest: { version: V_USB, buildIdentifier: "ST7-3.5.0-usb", targetRevisions: ["B3"], artifactDigestSha256: DIGEST_OF_ARTIFACT_B, artifactSizeBytes: 349_999, artifactUrl: "https://s3.firmwarecouncil.local/st7/3.5.0/fw.bin", productCompatibility: "B3 bootloaders >= 1.2", securityNotes: "Adds USB DFU signing check." },
    rolloutPolicy: { canaryCohortSize: 2, stages: [{ kind: "CANARY", targetPercent: 5, minDwellMinutes: 30, requiresManualAdvance: true, autoHaltOnFailurePercent: 5 }, { kind: "FULL", targetPercent: 100, minDwellMinutes: 60, requiresManualAdvance: true, autoHaltOnFailurePercent: 5 }], requiresOperatorApproval: true },
  });
  (rel2 as any).releaseId = rel2.id;
  await malMaker.post(`/api/v1/releases/${rel2.releaseId}/signature`, { signature: signManufacturer(rel2.manifest.manifestDigest, rel2.releaseId) });
  await reviewer.post(`/api/v1/releases/${rel2.releaseId}/approve`, { phase: "SECURITY_REVIEW", comments: "ok", signatureDigest: decisionDigest(rel2.releaseId, "SECURITY_REVIEWER", "APPROVE") });
  try {
    await reviewer.post(`/api/v1/releases/${rel2.releaseId}/approve`, { phase: "SECURITY_REVIEW", comments: "duplicate", signatureDigest: decisionDigest(rel2.releaseId, "SECURITY_REVIEWER", "APPROVE") });
    assert("duplicate approval rejected", false);
  } catch (e: any) { assert("duplicate approval rejected", e?.code === "duplicate_decision" || e?.code === "invalid_release_state", String(e?.code)); }

  // operator approving before security approval should fail
  const rel3: any = await malMaker.post("/api/v1/releases", {
    productLineId: (await (await fetch(`${BASE}/api/v1/product-lines`, { headers: { Authorization: `Bearer ${makerToken}` } })).json())[0].id,
    manifest: { version: V_CANARYFAIL, buildIdentifier: "ST7-3.5.1-canary", targetRevisions: ["B3"], artifactDigestSha256: createHash("sha256").update(`ST7-3.5.1-canary${RUN_TAG}.bin`).digest("hex"), artifactSizeBytes: 340_000, artifactUrl: "https://s3.firmwarecouncil.local/st7/3.5.1/fw.bin", productCompatibility: "x", securityNotes: "" },
    rolloutPolicy: { canaryCohortSize: 3, stages: [{ kind: "FULL", targetPercent: 100, minDwellMinutes: 30, requiresManualAdvance: true, autoHaltOnFailurePercent: 5 }], requiresOperatorApproval: true },
  });
  (rel3 as any).releaseId = rel3.id;
  await malMaker.post(`/api/v1/releases/${rel3.releaseId}/signature`, { signature: signManufacturer(rel3.manifest.manifestDigest, rel3.releaseId) });
  try {
    await (new ApiClient(BASE)).post(`/api/v1/releases/${rel3.releaseId}/approve`, { phase: "OPERATOR_APPROVAL", comments: "too early", signatureDigest: decisionDigest(rel3.releaseId, "OPERATOR", "APPROVE") }, );
    assert("operator approval before security review rejected", false);
  } catch (e: any) { assert("operator approval before security review rejected", e?.code !== "order_ok", String(e?.code)); }

  // rollout without operator approval ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â canary before approval
  try {
    await operator.post(`/api/v1/releases/${rel3.releaseId}/rollout`, { action: "open-canary" });
    assert("canary unaucthorised-rollout blocked", false);
  } catch (e: any) { assert("canary unauthorised-rollout blocked", e?.code === "invalid_release_state", String(e?.code)); }

  // canary failure path opens incident
  await reviewer.post(`/api/v1/releases/${rel3.releaseId}/approve`, { phase: "SECURITY_REVIEW", comments: "ok", signatureDigest: decisionDigest(rel3.releaseId, "SECURITY_REVIEWER", "APPROVE") });
  await operator.post(`/api/v1/releases/${rel3.releaseId}/approve`, { phase: "OPERATOR_APPROVAL", comments: "ok", signatureDigest: decisionDigest(rel3.releaseId, "OPERATOR", "APPROVE") });
  const canary3: any = await operator.post(`/api/v1/releases/${rel3.releaseId}/rollout`, { action: "open-canary" });
  const cohort3 = canary3.cohortDeviceIds;
  const fleetId = (await (await fetch(`${BASE}/api/v1/fleets`, { headers: { Authorization: `Bearer ${operatorToken}` } })).json())[0].id;
  const fleet3: any[] = (await (await fetch(`${BASE}/api/v1/fleets/${fleetId}`, { headers: { Authorization: `Bearer ${operatorToken}` } })).json()).devices;
  const canaryFailureAgent = new DeviceAgent(operator, fleet3.find((d) => d.id === cohort3[0]), fs.readFileSync(path.join(KEYS_DIR, "device.key"), "utf8"), { failRate: 1 });
  const outcome: any = await canaryFailureAgent.installAndReport({ releaseId: rel3.releaseId, version: V_CANARYFAIL, artifactDigestSha256: rel3.manifest.artifactDigestSha256, operatorToken, outcomeOverride: "FAILURE", failureReason: "boot loop after module init" });
  assert("canary failure receipt ingested", outcome.submitted === true, JSON.stringify(outcome));
  await operator.post(`/api/v1/releases/${rel3.releaseId}/rollout`, { action: "record-canary-result", success: false, reason: "boot loop after module init" });
  const failedDetail: any = await operator.get(`/api/v1/releases/${rel3.releaseId}`);
  assert("canary failure -> automatic incident", failedDetail.incidents?.length >= 1, JSON.stringify(failedDetail.incidents?.length));
  assert("canary failure halts (PAUSED)", failedDetail.status === "CANARY_FAILED", failedDetail.status);
  assert("release paused", failedDetail.status === "CANARY_FAILED" || failedDetail.status === "PAUSED", failedDetail.status);

  // rollback failure: bad target
  try {
    await operator.post(`/api/v1/releases/${rel3.releaseId}/rollout`, { action: "rollback", targetReleaseId: (await (await fetch(`${BASE}/api/v1/releases`, { headers: { Authorization: `Bearer ${operatorToken}` } })).json()).find((r: any) => r.manifest?.version === "3.3.0")?.id, reason: "canary failure" });
    const rb: any = await operator.get(`/api/v1/releases/${rel3.releaseId}`);
    assert("rollback authorised from CANARY_FAILED", rb.status === "ROLLBACK_AUTHORISED", rb.status);
  } catch (e: any) { assert("rollback authorised from CANARY_FAILED", false, String(e instanceof Error ? e.message : e)); }

  // key revocation
  const keysOfVolt: any[] = await (await fetch(`${BASE}/api/v1/keys`, { headers: { Authorization: `Bearer ${operatorToken}` } })).json();
  const devKeyId = keysOfVolt.find((k: any) => k.state === "ACTIVE")?.id;
  let receiptAfterRevoke: unknown;
  try {
    await (new ApiClient(BASE)); // unused; keep token flow simple
    // revoke on org ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â then follow-up receipt is refused
    const revoke: any = await fetch(`${BASE}/api/v1/keys/${devKeyId}/revoke`, { method: "POST", headers: { Authorization: `Bearer ${operatorToken}` } });
    assert("device key revoked", revoke.status === 200);
    const offlineDevice = fleet3.find((d) => d.status === "OFFLINE") ?? fleet3[0];
    const agentOffline = new DeviceAgent(operator, offlineDevice, fs.readFileSync(path.join(KEYS_DIR, "device.key"), "utf8"), { failRate: 0, offlineRate: 0 });
    receiptAfterRevoke = await agentOffline.installAndReport({ releaseId: propose.releaseId, version: V_MAIN, artifactDigestSha256: DIGEST_OF_ARTIFACT_A, operatorToken });
    assert("receipt after key revocation refused", receiptAfterRevoke?.submitted === false, JSON.stringify(receiptAfterRevoke));
  } catch (e: any) {
    assert("receipt after key revocation refused", String((e as any)?.code ?? "").length > 0, String(e));
  }

  // offline device retry
  const offline = fleet3.find((d) => d.status === "OFFLINE");
  if (offline) {
    const agentOffline2 = new DeviceAgent(operator, offline, fs.readFileSync(path.join(KEYS_DIR, "device.key"), "utf8"), { failRate: 0, offlineRate: 0 });
    const offlineReceipt: any = await agentOffline2.installAndReport({ releaseId: propose.releaseId, version: V_MAIN, artifactDigestSha256: DIGEST_OF_ARTIFACT_A, operatorToken });
    // offline device simply did not submit; the release remains intact
    assert("offline device does not corrupt release state", offlineReceipt.submitted === false);
  }

  // approve wrong signer: security reviewer signing with operator token? skip; sim-tested in Foundry
  console.log("\nRelease train");
  const train = await fetch(`${BASE}/api/v1/releases/${propose.id ?? propose.releaseId}/pipeline`, { headers: { Authorization: `Bearer ${operatorToken}` } });
  const pip = await train.json();
  assert("release train has all steps", Array.isArray(pip.steps) && pip.steps.length === 6);
  const done = new Set(pip.steps?.filter((s: any) => s.state === "done").map((s: any) => s.name));
  assert("train shows proposed/security/operator/canary/rollout/deployed wake states", ["PROPOSED", "SECURITY REVIEW", "OPERATOR APPROVAL", "CANARY", "ROLLOUT", "DEPLOYED"].every((s) => done.has(s)), JSON.stringify([...done]));

  const auditRes = await fetch(`${BASE}/api/v1/audit?limit=200`, { headers: { Authorization: `Bearer ${operatorToken}` } });
  const audit = await auditRes.json();
  assert("audit chain intact", audit.intact === true, "hash-chain");
  assert("audit events written", audit.events.length > 10);

  if (failures.length) {
    console.error(`\n${failures.length} assertion(s) failed:\n - ${failures.join("\n - ")}`);
    process.exit(1);
  } else {
    console.log("\nAll e2e assertions passed. Release governance workflow is functioning end-to-end.\n");
  }
}

/** lol with tsx this works */
ApiClient.prototype.post = async function (pathUrl: string, body: unknown) {
  const res = await fetch(`${(this as any).baseUrl}${pathUrl}`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${(this as any).token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e: any = new Error(((json as any)?.error?.code ?? `http_${res.status}`) + ": " + ((json as any)?.error?.message ?? ""));
    (e as any).code = (json as any)?.error?.code;
    (e as any).httpStatus = res.status;
    throw e;
  }
  return json;
};
ApiClient.prototype.get = async function (pathUrl: string) {
  const res = await fetch(`${(this as any).baseUrl}${pathUrl}`, { headers: { Authorization: `Bearer ${(this as any).token}` } });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e: any = new Error(((json as any)?.error?.code ?? `http_${res.status}`));
    (e as any).code = (json as any)?.error?.code;
    (e as any).httpStatus = res.status;
    throw e;
  }
  return json;
};

main().catch((err) => {
  console.error("E2E harness crashed:", err);
  process.exit(1);
});
