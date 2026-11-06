import { randomUUID, verify as verifySig, createPublicKey } from "node:crypto";
import { JsonStore, sha256Hex } from "./store.mts";
import { AuditService } from "./audit.mts";
import { BlockchainMirror } from "./blockchain.mts";
import {
  validateManifest,
  manifestDigest,
  isDuplicateArtifact,
  type ManifestInput,
} from "./manifest.mts";

/**
 * FirmwareCouncil governance engine — the multi-party release workflow.
 *
 * State machine (mirrors ReleaseGovernance.sol on BOT Chain):
 *   DRAFT -> PROPOSED -> SECURITY_APPROVED -> OPERATOR_APPROVED
 *         -> CANARY_RUNNING -> (CANARY_PASSED | CANARY_FAILED)
 *         -> ROLLOUT_IN_PROGRESS -> DEPLOYED
 *   side branches: CHANGES_REQUESTED / REJECTED / PAUSED / REVOKED /
 *                  SUPERSEDED / ROLLBACK_AUTHORISED
 */

export class GovernanceError extends Error {
  constructor(public code: string, public httpStatus: number, public detail?: string) {
    super(code);
  }
}

const INCIDENT_AUTO_HALT_PERCENT = 10;

export class GovernanceService {
  constructor(
    private store: JsonStore,
    private audit: AuditService,
    private chain: BlockchainMirror,
  ) {}

  // ------------------------------------------------------------ gates

  private requireOrg(user: any, wantedRole: string, wantedOrgType: string) {
    if (!user) throw new GovernanceError("not_authenticated", 401);
    if (wantedRole && user.role !== wantedRole && user.role !== "PLATFORM_ADMIN") {
      throw new GovernanceError("forbidden_role", 403, `requires ${wantedRole} but session is ${user.role}`);
    }
    if (wantedOrgType) {
      const org = this.store.get("organisations", user.organisationId);
      if (org?.type !== wantedOrgType && user.role !== "PLATFORM_ADMIN") {
        throw new GovernanceError("forbidden_org_type", 403, `requires org type ${wantedOrgType}`);
      }
    }
  }

  private getRelease(releaseId: string) {
    const rel = this.store.get("releases", releaseId);
    if (!rel) throw new GovernanceError("release_not_found", 404);
    return rel;
  }

  private latestDecision(releaseId: string, role: "SECURITY_REVIEWER" | "OPERATOR") {
    return this.store
      .filter("approvals", (a) => a.releaseId === releaseId && a.governanceRole === role)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  }

  // ------------------------------------------------------------ product lines

  createProductLine(user: any, input: any) {
    this.requireOrg(user, "MANUFACTURER", "MANUFACTURER");
    if (!input?.name || !input?.productName) {
      throw new GovernanceError("invalid_product_line", 400, "name and productName are required");
    }
    const pl = this.store.put("productLines", {
      organisationId: user.organisationId,
      name: input.name,
      productName: input.productName,
      hardwareRevisions: (input.hardwareRevisions ?? []).map((r: any) => ({
        id: randomUUID(),
        productLineId: "",
        revision: r.revision,
        architecture: r.architecture ?? input.defaultArchitecture ?? "armv7-m",
        bootloaderRequirement: r.bootloaderRequirement ?? input.bootloaderRequirements ?? "",
        createdAt: new Date().toISOString(),
      })),
      defaultArchitecture: input.defaultArchitecture ?? "armv7-m",
      bootloaderRequirements: input.bootloaderRequirements ?? "",
      otaProviderId: input.otaProviderId ?? "",
      compatibilityPolicy: input.compatibilityPolicy ?? "strict",
      supportedFirmwareVersions: input.supportedFirmwareVersions ?? [],
      createdAt: new Date().toISOString(),
      active: true,
    });
    pl.hardwareRevisions = pl.hardwareRevisions.map((r: any) => ({ ...r, productLineId: pl.id }));
    this.audit.append({
      kind: "product-line.created",
      entity: `product-line:${pl.id}`,
      detail: `${pl.productName} (${pl.hardwareRevisions.map((r: any) => r.revision).join(", ")})`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record("PRODUCT_LINE_REGISTERED", pl.id);
    return pl;
  }

  // ------------------------------------------------------------ release proposal

  /** The 10-step release wizard ends here: */
  proposeRelease(user: any, input: {
    productLineId: string;
    manifest: ManifestInput;
    approvalRequirements?: { securityReviewerCount?: number; operatorApprovalRequired?: boolean; crossOrg?: boolean };
    rolloutPolicy?: {
      canaryCohortSize: number;
      stages: Array<{ kind: string; targetPercent: number; minDwellMinutes: number; requiresManualAdvance: boolean; autoHaltOnFailurePercent: number }>;
      requiresOperatorApproval?: boolean;
      rollbackTargetReleaseId?: string;
    } | null;
  }) {
    this.requireOrg(user, "MANUFACTURER", "MANUFACTURER");
    const pl = this.store.get("productLines", input.productLineId);
    if (!pl || pl.organisationId !== user.organisationId) {
      throw new GovernanceError("product_line_not_found", 404);
    }
    if (!pl.active) throw new GovernanceError("product_line_inactive", 409);
    const issues = validateManifest(input.manifest as Partial<ManifestInput>);
    if (issues.length) {
      this.audit.append({
        kind: "release.proposal_rejected",
        entity: "release:new",
        detail: `manifest rejected: ${issues.join("; ")}`,
        actorUserId: user.id,
        actorOrganisationId: user.organisationId,
      });
      throw new GovernanceError("invalid_manifest", 400, issues.join("; "));
    }

    const manifest = input.manifest as ManifestInput;
    const digest = manifestDigest(manifest);
    if (isDuplicateArtifact(this.store, manifest.artifactDigestSha256)) {
      throw new GovernanceError("duplicate_artifact_digest", 409,
        "this SHA-256 artifact digest is already registered for another release on this product line");
    }
    const release = this.store.put("releases", {
      organisationId: user.organisationId,
      productLineId: pl.id,
      status: "PROPOSED",
      manifest: { ...manifest, previousReleaseId: input.manifest.previousReleaseId ?? this.findPreviousVersion(pl.id, manifest.version) ?? null, manifestDigest: digest },
      approvals: [] as any[],
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    });

    if (input.rolloutPolicy) {
      const stages = input.rolloutPolicy.stages
        .slice()
        .sort((a, b) => a.targetPercent - b.targetPercent)
        .map((s, i) => ({ ...s, order: i + 1, id: randomUUID(), rolloutPolicyId: "" }));
      const policy = this.store.put("rolloutPolicies", {
        releaseId: release.id,
        canaryCohortSize: input.rolloutPolicy.canaryCohortSize ?? 5,
        stages,
        requiresOperatorApproval: input.rolloutPolicy.requiresOperatorApproval ?? true,
        rollbackTargetReleaseId: input.rolloutPolicy.rollbackTargetReleaseId ?? null,
        createdAt: new Date().toISOString(),
      });
      // back-fill stage references
      for (const st of (this.store.get("rolloutPolicies", policy.id) as any).stages) {
        st.rolloutPolicyId = policy.id;
      }
      this.store.flush();
    }

    this.audit.append({
      kind: "release.proposed",
      entity: `release:${release.id}`,
      detail: `v${manifest.version} build ${manifest.buildIdentifier} digest ${manifest.artifactDigestSha256.slice(0, 16)}…`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record("RELEASE_PROPOSED", release.id);
    return release;
  }

  findPreviousVersion(productLineId: string, version: string): string | undefined {
    const candidates = this.store
      .filter("releases", (r) => r.productLineId === productLineId)
      .filter((r) => ["DEPLOYED", "ROLLOUT_IN_PROGRESS", "OPERATOR_APPROVED"].includes(r.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return candidates[0]?.id;
  }

  // ------------------------------------------------------------ approvals

  /**
   * Manufacturer signing tool signs (manifestDigest || releaseId) with the
   * HSM-backed release key; the backend verifies against the org's ACTIVE
   * Ed25519 public key and stores the reference. Private keys never leave
   * the manufacturer workstation.
   */
  registerManufacturerSignature(user: any, releaseId: string, signatureB64: string) {
    this.requireOrg(user, "MANUFACTURER", "MANUFACTURER");
    const rel = this.getRelease(releaseId);
    if (!["PROPOSED", "CHANGES_REQUESTED", "SECURITY_APPROVED", "OPERATOR_APPROVED", "CANARY_RUNNING", "CANARY_PASSED", "ROLLOUT_IN_PROGRESS"].includes(rel.status)) {
      throw new GovernanceError("invalid_release_state", 409, `cannot attach manufacturer signature to a ${rel.status}`);
    }
    const message = Buffer.concat([
      Buffer.from(rel.manifest.manifestDigest, "utf8"),
      Buffer.from(releaseId, "utf8"),
    ]);
    const activeKey = this.store.find("signingKeys", (k) => k.organisationId === rel.organisationId && k.state === "ACTIVE");
    if (!activeKey) throw new GovernanceError("no_active_manufacturer_key", 409);
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(activeKey.publicKey, "base64")]);
    const key = createPublicKey({ key: der, format: "der", type: "spki" });
    const ok = verifySig(null, message, key, Buffer.from(signatureB64, "base64"));
    if (!ok) {
      this.audit.append({
        kind: "release.signature_invalid",
        entity: `release:${releaseId}`,
        detail: "manufacturer signature failed verification against the active signing key — refused",
        actorUserId: user.id,
        actorOrganisationId: user.organisationId,
      });
      throw new GovernanceError("invalid_signature", 400, "manufacturer signature failed verification against the active signing key");
    }
    this.store.update("releases", releaseId, {
      manufacturerSignatureB64: signatureB64,
      manufacturerSignatureKeyId: activeKey.id,
      manufacturerSignatureAt: new Date().toISOString(),
    });
    this.audit.append({
      kind: "release.manufacturer_signature_registered",
      entity: `release:${releaseId}`,
      detail: `signed with key ${activeKey.fingerprint} (${activeKey.label})`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    return this.getRelease(releaseId);
  }

  decideSecurity(user: any, releaseId: string, decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES", comments: string, signatureDigest: string) {
    this.requireOrg(user, "SECURITY_REVIEWER", "SECURITY");
    const rel = this.getRelease(releaseId);
    if (!["PROPOSED", "CHANGES_REQUESTED"].includes(rel.status)) {
      throw new GovernanceError("invalid_release_state", 409, `security review done for status ${rel.status}`);
    }
    const org = this.store.get("organisations", user.organisationId);
    const crossOrg = this.store.get("releases", releaseId)?.organisationId !== user.organisationId;
    if (!crossOrg) {
      throw new GovernanceError("cross_org_required", 403,
        "security reviewers must be from a different organisation than the manufacturer");
    }
    const approval = this.recordApproval(releaseId, user, "SECURITY_REVIEWER", decision, comments, signatureDigest);
    const newStatus = decision === "APPROVE" ? "SECURITY_APPROVED" : decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
    this.store.update("releases", releaseId, { status: newStatus });
    this.audit.append({
      kind: `release.security_${decision.toLowerCase()}`,
      entity: `release:${releaseId}`,
      detail: `status -> ${newStatus}; comments: ${comments || "(none)"}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record(decision === "APPROVE" ? "RELEASE_APPROVED" : "RELEASE_REJECTED", releaseId, { governanceRole: "SECURITY_REVIEWER", decision });
    return { release: this.getRelease(releaseId), approval };
  }

  decideOperator(user: any, releaseId: string, decision: "APPROVE" | "REJECT" | "REQUEST_CHANGES", comments: string, signatureDigest: string) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    if (rel.status !== "SECURITY_APPROVED") {
      throw new GovernanceError("invalid_release_state", 409,
        `operator approval requires SECURITY_APPROVED, got ${rel.status}`);
    }
    const org = this.store.get("organisations", user.organisationId);
    if (rel.organisationId === user.organisationId) {
      throw new GovernanceError("cross_org_required", 403,
        "the operator approving must be a different organisation from the manufacturer");
    }
    const approval = this.recordApproval(releaseId, user, "OPERATOR", decision, comments, signatureDigest);
    const newStatus = decision === "APPROVE" ? "OPERATOR_APPROVED" : decision === "REJECT" ? "REJECTED" : "CHANGES_REQUESTED";
    this.store.update("releases", releaseId, { status: newStatus });
    this.audit.append({
      kind: `release.operator_${decision.toLowerCase()}`,
      entity: `release:${releaseId}`,
      detail: `status -> ${newStatus}; comments: ${comments || "(none)"}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record(decision === "APPROVE" ? "RELEASE_APPROVED" : "RELEASE_REJECTED", releaseId, { governanceRole: "OPERATOR", decision });
    return { release: this.getRelease(releaseId), approval };
  }

  private recordApproval(releaseId: string, user: any, governanceRole: "SECURITY_REVIEWER" | "OPERATOR", decision: string, comments: string, signatureDigest: string) {
    const rel = this.getRelease(releaseId);
    const dup = rel.approvals?.find(
      (a: any) => a.approverUserId === user.id && a.governanceRole === governanceRole,
    );
    if (dup) throw new GovernanceError("duplicate_decision", 409, `${user.name} already made ${governanceRole} decision on this release`);
    if (!signatureDigest || !/^[a-f0-9]{64}$/.test(signatureDigest)) {
      throw new GovernanceError("invalid_signature_digest", 400, "decision must include sha256 signatureDigest of the signed decision payload");
    }
    const approval = this.store.put("approvals", {
      releaseId,
      approverUserId: user.id,
      approverOrganisationId: user.organisationId,
      governanceRole,
      decision,
      timestamp: new Date().toISOString(),
      signatureDigest,
      comments,
    });
    rel.approvals = [...(rel.approvals ?? []), approval.id];
    this.store.update("releases", releaseId, { approvals: rel.approvals });
    return approval;
  }

  // ------------------------------------------------------------ canary + rollout

  openCanary(user: any, releaseId: string) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    if (rel.status !== "OPERATOR_APPROVED") {
      throw new GovernanceError("invalid_release_state", 409, `canary requires OPERATOR_APPROVED, got ${rel.status}`);
    }
    const policy = this.store.find("rolloutPolicies", (p) => p.releaseId === releaseId);
    if (!policy) throw new GovernanceError("rollout_policy_missing", 409);
    const fleet = this.store.find("fleets", (f) => f.productLineId === rel.productLineId);
    if (!fleet) throw new GovernanceError("fleet_missing", 409, "no device fleet exists for this product line");
    const devices = this.store.filter("devices", (d) => d.fleetId === fleet.id && d.status !== "RETIRED");
    const cohort = devices.slice(0, policy.canaryCohortSize);
    this.store.put("rollouts", {
      releaseId,
      rolloutPolicyId: policy.id,
      status: "CANARY",
      currentStageOrder: 0,
      stageStartedAt: new Date().toISOString(),
      cohortDeviceIds: cohort.map((d) => d.id),
      startedAt: new Date().toISOString(),
      progress: {
        eligibleDevices: cohort.length + Math.max(devices.length - cohort.length, 0),
        contacted: 0,
        successes: 0,
        failures: 0,
        offline: devices.filter((d) => d.status === "OFFLINE").length,
      },
    });
    this.store.update("releases", releaseId, { status: "CANARY_RUNNING" });
    this.audit.append({
      kind: "rollout.canary_opened",
      entity: `release:${releaseId}`,
      detail: `canary cohort of ${cohort.length} devices`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record("CANARY_OPENED", releaseId);
    return { release: this.getRelease(releaseId), cohortDeviceIds: cohort.map((d) => d.id) };
  }

  recordCanaryResult(user: any, releaseId: string, success: boolean, reason: string) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    if (!["CANARY_RUNNING", "CANARY_FAILED"].includes(rel.status)) {
      throw new GovernanceError("invalid_release_state", 409, `canary result requires CANARY_RUNNING, got ${rel.status}`);
    }
    if (success) {
      this.store.update("releases", releaseId, { status: "CANARY_PASSED" });
      this.audit.append({
        kind: "rollout.canary_passed",
        entity: `release:${releaseId}`,
        detail: reason || "canary cohort succeeded — release is eligible for authorised rollout",
        actorUserId: user.id,
        actorOrganisationId: user.organisationId,
      });
    } else {
      this.store.update("releases", releaseId, { status: "CANARY_FAILED" });
      this.audit.append({
        kind: "rollout.canary_failed",
        entity: `release:${releaseId}`,
        detail: `canary failed: ${reason}`,
        actorUserId: user.id,
        actorOrganisationId: user.organisationId,
      });
      void this.openIncidentFromSystem(releaseId, reason, "canary failed");
    }
    void this.chain.record("CANARY_RESULT", releaseId, { success });
    return this.getRelease(releaseId);
  }

  authoriseRollout(user: any, releaseId: string) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    if (rel.status !== "CANARY_PASSED") {
      throw new GovernanceError("invalid_release_state", 409, `rollout requires CANARY_PASSED, got ${rel.status}`);
    }
    const rogue = this.store.find("rollouts", (r) => r.releaseId === releaseId);
    if (rogue) {
      this.store.update("rollouts", rogue.id, { status: "RUNNING", currentStageOrder: 1, stageStartedAt: new Date().toISOString() });
    }
    this.store.update("releases", releaseId, { status: "ROLLOUT_IN_PROGRESS" });
    this.audit.append({
      kind: "rollout.authorised",
      entity: `release:${releaseId}`,
      detail: "staged rollout authorised (requires security + operator approval both recorded)",
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record("ROLLOUT_AUTHORISED", releaseId);
    void this.chain.record("ROLLOUT_ADVANCED", releaseId, { stage: 1 });
    return this.getRelease(releaseId);
  }

  advanceRollout(user: any, releaseId: string, stageOrder?: number) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    if (rel.status !== "ROLLOUT_IN_PROGRESS") {
      throw new GovernanceError("invalid_release_state", 409, `advancement requires ROLLOUT_IN_PROGRESS, got ${rel.status}`);
    }
    const policy = this.store.find("rolloutPolicies", (p) => p.releaseId === releaseId);
    const state = this.store.find("rollouts", (r) => r.releaseId === releaseId);
    if (!policy || !state) throw new GovernanceError("rollout_missing", 409);
    const nextStage = stageOrder ?? state.currentStageOrder + 1;
    const stage = policy.stages.find((s: any) => s.order === nextStage);
    if (!stage) {
      // stage beyond final — complete the deployment
      this.store.update("releases", releaseId, { status: "DEPLOYED" });
      this.store.update("rollouts", state.id, { status: "COMPLETED" });
      this.audit.append({
        kind: "rollout.deployed",
        entity: `release:${releaseId}`,
        detail: "all rollout stages complete; release is DEPLOYED",
        actorUserId: user.id,
        actorOrganisationId: user.organisationId,
      });
      return this.getRelease(releaseId);
    }
    this.store.update("rollouts", state.id, {
      currentStageOrder: nextStage,
      stageStartedAt: new Date().toISOString(),
    });
    this.audit.append({
      kind: "rollout.advanced",
      entity: `release:${releaseId}`,
      detail: `advanced to stage ${stage.order} (${stage.kind}, ${stage.targetPercent}%)`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record("ROLLOUT_ADVANCED", releaseId, { stage: nextStage });
    return this.getRelease(releaseId);
  }

  pauseRollout(user: any, releaseId: string, reason: string, isEmergency: boolean) {
    const rel = this.getRelease(releaseId);
    const canPause = user.role === "OPERATOR" || user.role === "PLATFORM_ADMIN" ||
      (isEmergency === true && (user.role === "OPERATOR" || user.role === "SECURITY_REVIEWER"));
    if (!canPause) throw new GovernanceError("forbidden_role", 403, "pause requires OPERATOR/PLATFORM_ADMIN");
    if (!["CANARY_RUNNING", "CANARY_PASSED", "CANARY_FAILED", "ROLLOUT_IN_PROGRESS"].includes(rel.status)) {
      throw new GovernanceError("invalid_release_state", 409, `cannot pause a ${rel.status}`);
    }
    this.store.update("releases", releaseId, { status: "PAUSED" });
    const rogue = this.store.find("rollouts", (r) => r.releaseId === releaseId);
    if (rogue) this.store.update("rollouts", rogue.id, { pausedAt: new Date().toISOString() });
    this.audit.append({
      kind: "rollout.paused",
      entity: `release:${releaseId}`,
      detail: `paused: ${reason || "no reason given"}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record("ROLLOUT_PAUSED", releaseId);
    return this.getRelease(releaseId);
  }

  resumeRollout(user: any, releaseId: string, note: string) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    if (rel.status !== "PAUSED") throw new GovernanceError("invalid_release_state", 409);
    const prior = this.store.find("rollouts", (r) => r.releaseId === releaseId);
    this.store.update("releases", releaseId, { status: "ROLLOUT_IN_PROGRESS" });
    if (prior) this.store.update("rollouts", prior.id, { pausedAt: null });
    this.audit.append({
      kind: "rollout.resumed",
      entity: `release:${releaseId}`,
      detail: `resumed: ${note || ""}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    return this.getRelease(releaseId);
  }

  revokeRelease(user: any, releaseId: string, reason: string, allowedRoles: string[] = ["OPERATOR", "PLATFORM_ADMIN"]) {
    const rel = this.getRelease(releaseId);
    if (!allowedRoles.includes(user.role)) throw new GovernanceError("forbidden_role", 403);
    if (["REVOKED", "SUPERSEDED", "ROLLBACK_AUTHORISED"].includes(rel.status)) {
      throw new GovernanceError("terminal_release", 409);
    }
    this.store.update("releases", releaseId, { status: "REVOKED" });
    this.audit.append({
      kind: "release.revoked",
      entity: `release:${releaseId}`,
      detail: `revoked: ${reason || "no reason given"}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    void this.chain.record("RELEASE_REVOKED", releaseId);
    return this.getRelease(releaseId);
  }

  authoriseRollback(user: any, releaseId: string, targetReleaseId: string, reason: string) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    const target = this.getRelease(targetReleaseId);
    if (target.status !== "DEPLOYED" && target.status !== "ROLLBACK_AUTHORISED" && target.organisationId !== rel.organisationId) {
      throw new GovernanceError("invalid_rollback_target", 409, `target is ${target.status} (must be DEPLOYED and same product line)`);
    }
    if (rel.status !== "CANARY_FAILED" && rel.status !== "PAUSED" && rel.status !== "DEPLOYED" && rel.status !== "ROLLOUT_IN_PROGRESS") {
      throw new GovernanceError("invalid_release_state", 409, `rollback not permitted from ${rel.status}`);
    }
    this.store.update("releases", releaseId, {
      status: "ROLLBACK_AUTHORISED",
      rollbackTargetReleaseId: targetReleaseId,
    });
    this.audit.append({
      kind: "release.rollback_authorised",
      entity: `release:${releaseId}`,
      detail: `rollback to ${target.manifest.version}: ${reason}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    return this.getRelease(releaseId);
  }

  supersede(user: any, releaseId: string, successorReleaseId: string) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const rel = this.getRelease(releaseId);
    const succ = this.getRelease(successorReleaseId);
    if (succ.productLineId !== rel.productLineId) {
      throw new GovernanceError("supersede_product_mismatch", 409);
    }
    if (["SUPERSEDED", "REVOKED"].includes(rel.status)) throw new GovernanceError("terminal_release", 409);
    this.store.update("releases", releaseId, { status: "SUPERSEDED", supersededBy: successorReleaseId });
    this.audit.append({
      kind: "release.superseded",
      entity: `release:${releaseId}`,
      detail: `superseded by ${succ.manifest.version}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    return this.getRelease(releaseId);
  }

  // ------------------------------------------------------------ receipts

  async ingestReceipt(user: any, deviceId: string, payload: any) {
    const device = this.store.get("devices", deviceId);
    if (!device) throw new GovernanceError("device_not_found", 404);
    const release = this.getRelease(payload.releaseId);
    if (["REJECTED", "REVOKED", "SUPERSEDED", "CHANGES_REQUESTED", "DRAFT"].includes(release.status)) {
      throw new GovernanceError("release_not_installable", 409, `a ${release.status} release cannot produce receipts`);
    }
    const pubKeyRow = this.store.find("signingKeys", (k) => k.organisationId === device.organisationId && k.id === device.deviceSigningKeyId) ??
      this.store.get("signingKeys", device.deviceSigningKeyId);
    if (!pubKeyRow) {
      throw new GovernanceError("device_signing_key_missing", 400, "device has no registered signing public key");
    }
    if (pubKeyRow.state === "REVOKED") {
      throw new GovernanceError("device_signing_key_revoked", 400);
    }
    const rel = this.store.get("releases", release.id);
    const expectedDigest = rel.manifest?.artifactDigestSha256;
    if (expectedDigest && payload.artifactDigestSha256 && payload.artifactDigestSha256 !== expectedDigest) {
      throw new GovernanceError("digest_mismatch", 400, "installed artifact digest differs from the registered release digest");
    }
    if (device.lastVerifiedVersion) {
      // Uptane rollback defense — refuses downgrade attempts from the device
      const compare = compareSemver(payload.version, device.lastVerifiedVersion);
      if (compare.valid && compare.older) {
        throw new GovernanceError("rollback_blocked", 409, `version ${payload.version} is older than verified ${device.lastVerifiedVersion}`);
      }
      void compare;
    }

    // verify the device signature (fail-closed)
    const keyObj = this.deserializeKey(pubKeyRow.publicKey);
    const canonical = payload.canonical ?? "";
    const signed = Buffer.concat([
      Buffer.from(canonical, "utf8"),
      Buffer.from(release.id, "utf8"),
      Buffer.from(device.id, "utf8"),
      Buffer.from(payload.timestamp ?? "", "utf8"),
    ]);
    const ok = verifySig(null, signed, keyObj, Buffer.from(payload.signature, "base64"));
    if (!ok) {
      throw new GovernanceError("invalid_receipt_signature", 400,
        "receipt signature failed verification against the registered device public key");
    }

    const receipt = this.store.put("receipts", {
      releaseId: release.id,
      deviceId: device.id,
      outcome: payload.outcome ?? "SUCCESS",
      version: payload.version ?? rel.manifest.version,
      artifactDigestSha256: payload.artifactDigestSha256 ?? release.manifest.artifactDigestSha256,
      failureReason: payload.failureReason ?? null,
      deviceSignature: payload.signature,
      receivedAt: new Date().toISOString(),
      batchId: payload.batchId ?? null,
    });
    this.store.update("devices", device.id, {
      lastSeenAt: receipt.receivedAt,
      status: receipt.outcome === "SUCCESS" ? "ONLINE" : "FAILED_UPTAKE",
      activeVersion: receipt.outcome === "SUCCESS" ? receipt.version : device.activeVersion,
      lastVerifiedVersion: receipt.outcome === "SUCCESS"
        ? receipt.version
        : device.lastVerifiedVersion,
    });
    this.updateRolloutProgress(release.id);
    return receipt;
  }

  updateRolloutProgress(releaseId: string) {
    const state = this.store.find("rollouts", (r) => r.releaseId === releaseId);
    if (!state) return;
    const receipts = this.store.filter("receipts", (r) => r.releaseId === releaseId);
    state.progress = {
      ...(state.progress ?? { eligibleDevices: 0, contacted: 0, successes: 0, failures: 0, offline: 0 }),
      contacted: receipts.length,
      successes: receipts.filter((r) => r.outcome === "SUCCESS").length,
      failures: receipts.filter((r) => r.outcome === "FAILURE").length,
    };
    this.store.put("rollouts", state);
  }

  // ------------------------------------------------------------ incidents

  openIncident(used_by: any, releaseId: string, input: {
    title: string;
    failureReason: string;
    severity?: string;
    responsibleEngineerId?: string;
    evidenceLinks?: string[];
    pauseRelease?: boolean;
  }) {
    this.requireOrg(used_by, "OPERATOR", "OPERATOR");
    return this._openIncidentCommon(releaseId, input, used_by);
  }

  private _openIncidentCommon(releaseId: string, input: any, user?: any) {
    const rel = this.getRelease(releaseId);
    const incident = this.store.put("incidents", {
      releaseId,
      organisationId: user?.organisationId ?? rel.organisationId,
      severity: input.severity ?? (["REVOKED"].includes(rel.status) ? "HIGH" : "MEDIUM"),
      status: "OPEN",
      title: input.title,
      failureReason: input.failureReason,
      responsibleEngineerId: input.responsibleEngineerId ?? user?.id,
      evidenceLinks: input.evidenceLinks ?? [],
      correctiveAction: null,
      openedAt: new Date().toISOString(),
    });
    if (input.pauseRelease !== false && !["REVOKED", "DEPLOYED", "REJECTED", "SUPERSEDED"].includes(rel.status)) {
      if (["CANARY_RUNNING", "ROLLOUT_IN_PROGRESS"].includes(rel.status)) this.pauseRollout(user ?? { id: null, role: "OPERATOR", organisationId: rel.organisationId }, releaseId, `incident: ${input.title}`, true);
    }
    this.audit.append({
      kind: "incident.opened",
      entity: `incident:${incident.id}`,
      detail: `${input.title} — ${input.failureReason}`,
      actorUserId: user?.id,
      actorOrganisationId: incident.organisationId,
    });
    return incident;
  }

  private openIncidentFromSystem(releaseId: string, reason: string, kind: string) {
    return this._openIncidentCommon(releaseId, {
      title: `Automatic incident — ${kind}`,
      failureReason: reason,
      severity: "HIGH",
      responsibleEngineerId: null,
      evidenceLinks: [],
      pauseRelease: false,
    });
  }

  listIncidents(filter?: { releaseId?: string; status?: string }) {
    return this.store
      .filter("incidents", (i) => (!filter?.releaseId || i.releaseId === filter.releaseId)
        && (!filter?.status || i.status.toLowerCase() === filter.status!.toLowerCase()))
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt));
  }

  updateIncident(user: any, incidentId: string, patch: any) {
    this.requireOrg(user, "OPERATOR", "OPERATOR");
    const inc = this.store.get("incidents", incidentId);
    if (!inc) throw new GovernanceError("incident_not_found", 404);
    const body: any = {};
    if (patch.status) body.status = patch.status;
    if (patch.correctiveAction) {
      body.correctiveAction = patch.correctiveAction;
      body.evidenceLinks = [...(inc.evidenceLinks ?? []), patch.correctiveAction];
    }
    if (patch.responsibleEngineerId) body.responsibleEngineerId = patch.responsibleEngineerId;
    if (patch.evidenceLinks) body.evidenceLinks = [...(inc.evidenceLinks ?? []), ...patch.evidenceLinks];
    if (patch.status === "RESOLVED") body.resolvedAt = new Date().toISOString();
    this.store.update("incidents", incidentId, body);
    this.audit.append({
      kind: "incident.updated",
      entity: `incident:${incidentId}`,
      detail: `update via ${patch.status ?? "edit"}`,
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    return this.store.get("incidents", incidentId);
  }

  addIncidentComment(user: any, incidentId: string, bodyText: string) {
    const inc = this.store.get("incidents", incidentId);
    if (!inc) throw new GovernanceError("incident_not_found", 404);
    const comment = this.store.put("incidentComments", {
      incidentId,
      authorUserId: user.id,
      body: bodyText,
      createdAt: new Date().toISOString(),
    });
    this.audit.append({
      kind: "incident.comment",
      entity: `incident:${incidentId}`,
      detail: bodyText.slice(0, 120),
      actorUserId: user.id,
      actorOrganisationId: user.organisationId,
    });
    return comment;
  }

  // ------------------------------------------------------------ reading

  releaseDetail(releaseId: string) {
    const rel = this.getRelease(releaseId);
    const pl = this.store.get("productLines", rel.productLineId);
    const org = this.store.get("organisations", rel.organisationId);
    const approvals = rel.approvals?.map((id: string) => this.store.get("approvals", id)).filter(Boolean) ?? [];
    const policy = this.store.find("rolloutPolicies", (p) => p.releaseId === releaseId);
    const state = this.store.find("rollouts", (r) => r.releaseId === releaseId);
    const receipts = this.store.filter("receipts", (r) => r.releaseId === releaseId);
    const incidents = this.store.filter("incidents", (i) => i.releaseId === releaseId);
    const fleet = this.store.find("fleets", (f) => f.productLineId === rel.productLineId);
    const devices = fleet
      ? this.store.filter("devices", (d) => d.fleetId === fleet.id && d.status !== "RETIRED")
      : [];
    const txs = this.store.filter("transactions", (t) => t.relatedEntityId === releaseId);
    return {
      ...rel,
      productLine: pl,
      manufacturer: org,
      approvals,
      rolloutPolicy: policy ?? null,
      rolloutState: state ?? null,
      fleetSize: devices.length,
      receipts: receipts.length,
      receiptsSummary: {
        successes: receipts.filter((r) => r.outcome === "SUCCESS").length,
        failures: receipts.filter((r) => r.outcome === "FAILURE").length,
      },
      incidents,
      transactions: txs,
    };
  }

  listReleases() {
    return this.store
      .list("releases")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => {
        const pl = this.store.get("productLines", r.productLineId);
        const org = this.store.get("organisations", r.organisationId);
        return {
          ...r,
          productName: pl?.name ?? "—",
          manufacturerOrgName: org?.name ?? "—",
        };
      });
  }

  private deserializeKey(pubB64: string) {
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(pubB64, "base64")]);
    return createPublicKey({ key: der, format: "der", type: "spki" });
  }
}

/**
 * Strict-semver comparator returning { valid, older } where `older` means
 * l<r (used for Uptane rollback defense).
 */
export function compareSemver(a: string, b: string): { valid: boolean; older?: boolean; equal?: boolean } {
  const m = (x: string) => x.match(/^(\d+)\.(\d+)\.(\d+)/);
  const ma = m(a);
  const mb = m(b);
  if (!ma || !mb) return { valid: false };
  for (let i = 1; i <= 3; i++) {
    const x = parseInt(ma[i]!, 10);
    const y = parseInt(mb[i]!, 10);
    if (x !== y) return { valid: true, older: x < y };
  }
  return { valid: true, older: false, equal: true };
}
