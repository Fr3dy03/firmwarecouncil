import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { JsonStore } from "../services/store.mts";
import type { AuthService } from "../services/auth.mts";
import { SigningKeysService } from "../services/keys.mts";
import { GovernanceService } from "../services/releases.mts";
import { requireUser, extractToken } from "./common.mts";
import { SimulatorAdapter } from "../services/ota/simulator.mts";
import { MenderAdapter } from "../services/ota/mender.mts";
import { HawkbitAdapter } from "../services/ota/hawkbit.mts";
import { BalenaAdapter } from "../services/ota/balena.mts";

/**
 * All REST routes. Every governance action appends to the audit trail via
 * GovernanceService; every chain-visible action is mirrored via
 * BlockchainMirror (see server.mts wiring).
 */
export function registerRoutes(app: FastifyInstance, store: JsonStore, auth: AuthService, keys: SigningKeysService, gov: GovernanceService) {
  // -------------------------------------------------- auth
  app.post("/api/v1/auth/login", async (req: any, reply: any) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return reply.status(400).send({ error: { code: "bad_request", message: "email and password required" } });
    const { token, user } = auth.login(email, password);
    return { token, user };
  });

  app.post("/api/v1/auth/logout", async (req: any) => {
    const token = extractToken(req);
    if (token) auth.logout(token);
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (req: any) => ({ user: requireUser(req) }));

  app.get("/api/v1/users", async (req: any) => {
    requireUser(req);
    return store.list("users").map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, organisationId: u.organisationId }));
  });

  app.post("/api/v1/invitations", async (req: any, reply: any) => {
    const user = requireUser(req);
    if (user.role !== "PLATFORM_ADMIN" && user.role !== "OPERATOR") {
      return reply.status(403).send({ error: { code: "forbidden_role", message: "only platform admins/operators can invite" } });
    }
    const { email, name, organisationId, role, password } = req.body ?? {};
    if (!email || !name || !organisationId || !role || !password) {
      return reply.status(400).send({ error: { code: "bad_request", message: "email, name, organisationId, role, password are required" } });
    }
    if (!store.get("organisations", organisationId)) {
      return reply.status(404).send({ error: { code: "organisation_not_found", message: "unknown organisation" } });
    }
    const created = auth.createUser({ email, name, password, organisationId, role });
    return created;
  });

  // -------------------------------------------------- organisations
  app.get("/api/v1/organisations", async (req: any) => {
    requireUser(req);
    return store.list("organisations").map((o) => ({ ...o }));
  });

  // -------------------------------------------------- status (app overview)
  app.get("/api/v1/status", async () => {
    const releases = store.list("releases");
    const byStatus: Record<string, number> = {};
    for (const r of releases) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const openIncidents = store.filter("incidents", (i) => i.status !== "RESOLVED").length;
    const chainMirror = (() => {
      try {
        return (gov as any).chain?.status?.() ?? null;
      } catch {
        return null;
      }
    })();
    return {
      service: "FirmwareCouncil API",
      product: "release governance",
      chain: chainMirror,
      counts: {
        organisations: store.list("organisations").length,
        productLines: store.list("productLines").length,
        releases: releases.length,
        devices: store.list("devices").length,
        openIncidents,
        receipts: store.list("receipts").length,
      },
      releasesByStatus: byStatus,
    };
  });

  // -------------------------------------------------- product lines
  app.post("/api/v1/product-lines", async (req: any) => gov.createProductLine(requireUser(req), req.body));
  app.get("/api/v1/product-lines", async (req: any) => {
    const user = requireUser(req);
    return store.list("productLines").filter((p) => p.organisationId === user.organisationId || user.role === "PLATFORM_ADMIN" || user.role === "OPERATOR" || user.role === "SECURITY_REVIEWER");
  });
  app.get("/api/v1/product-lines/:id", async (req: any, reply: any) => {
    requireUser(req);
    const pl = store.get("productLines", (req.params as any).id);
    if (!pl) return reply.status(404).send({ error: { code: "not_found", message: "product line not found" } });
    return pl;
  });

  // -------------------------------------------------- releases
  app.post("/api/v1/releases", async (req: any) => gov.proposeRelease(requireUser(req), req.body));
  app.get("/api/v1/releases", async (req: any) => {
    requireUser(req);
    return gov.listReleases();
  });
  app.get("/api/v1/releases/:id", async (req: any, reply: any) => {
    requireUser(req);
    try {
      return gov.releaseDetail((req.params as any).id);
    } catch {
      return reply.status(404).send({ error: { code: "release_not_found", message: "unknown release" } });
    }
  });

  app.post("/api/v1/releases/:id/approve", async (req: any) => {
    const user = requireUser(req);
    const { phase = "SECURITY_REVIEW", comments = "", signatureDigest } = req.body ?? {};
    if (!signatureDigest) {
      throw { httpStatus: 400, code: "invalid_signature_digest", message: "signatureDigest (sha256 of signed decision payload) is mandatory" } as any;
    }
    if (phase === "SECURITY_REVIEW") {
      return gov.decideSecurity(user, (req.params as any).id, "APPROVE", comments, signatureDigest);
    }
    return gov.decideOperator(user, (req.params as any).id, "APPROVE", comments, signatureDigest);
  });

  app.post("/api/v1/releases/:id/reject", async (req: any) => {
    const user = requireUser(req);
    const { phase = "SECURITY_REVIEW", comments = "", signatureDigest } = req.body ?? {};
    if (!signatureDigest) throw { httpStatus: 400, code: "invalid_signature_digest", message: "signatureDigest is mandatory" } as any;
    if (phase === "SECURITY_REVIEW") return gov.decideSecurity(user, (req.params as any).id, "REJECT", comments, signatureDigest);
    return gov.decideOperator(user, (req.params as any).id, "REJECT", comments, signatureDigest);
  });

  app.post("/api/v1/releases/:id/request-changes", async (req: any) => {
    const user = requireUser(req);
    const { phase = "SECURITY_REVIEW", comments = "", signatureDigest } = req.body ?? {};
    if (!signatureDigest) throw { httpStatus: 400, code: "invalid_signature_digest", message: "signatureDigest is mandatory" } as any;
    if (phase === "SECURITY_REVIEW") return gov.decideSecurity(user, (req.params as any).id, "REQUEST_CHANGES", comments, signatureDigest);
    return gov.decideOperator(user, (req.params as any).id, "REQUEST_CHANGES", comments, signatureDigest);
  });

  app.post("/api/v1/releases/:id/signature", async (req: any) => {
    const user = requireUser(req);
    const { signature } = req.body ?? {};
    if (!signature) throw { httpStatus: 400, code: "bad_request", message: "signature (base64 over manifestDigest||releaseId) required" } as any;
    return gov.registerManufacturerSignature(user, (req.params as any).id, signature);
  });

  app.post("/api/v1/releases/:id/rollout", async (req: any) => {
    const user = requireUser(req);
    const { action, stageOrder, reason, notes, targetReleaseId } = req.body ?? {};
    switch (action) {
      case "open-canary":
        return gov.openCanary(user, (req.params as any).id);
      case "record-canary-result":
        return gov.recordCanaryResult(user, (req.params as any).id, !!req.body?.success, reason ?? "");
      case "authorise-rollout":
        return gov.authoriseRollout(user, (req.params as any).id);
      case "advance":
        return gov.advanceRollout(user, (req.params as any).id, stageOrder);
      case "pause":
        return gov.pauseRollout(user, (req.params as any).id, reason ?? "", false);
      case "resume":
        return gov.resumeRollout(user, (req.params as any).id, notes ?? "");
      case "revoke":
        return gov.revokeRelease(user, (req.params as any).id, reason ?? "", ["OPERATOR", "PLATFORM_ADMIN", "SECURITY_REVIEWER"]);
      case "rollback":
        return gov.authoriseRollback(user, (req.params as any).id, targetReleaseId ?? "", reason ?? "");
      case "supersede":
        return gov.supersede(user, (req.params as any).id, targetReleaseId ?? "");
      default:
        throw { httpStatus: 400, code: "unknown_rollout_action", message: "action must be one of open-canary | record-canary-result | authorise-rollout | advance | pause | resume | revoke | rollback | supersede" } as any;
    }
  });

  app.get("/api/v1/releases/:id/pipeline", async (req: any) => {
    requireUser(req);
    return buildReleaseTrain(store, (req.params as any).id, gov);
  });

  // -------------------------------------------------- fleets + devices
  app.get("/api/v1/fleets", async (req: any) => {
    requireUser(req);
    return store.list("fleets").map((f) => ({
      ...f,
      devices: store.filter("devices", (d) => d.fleetId === f.id).length,
    }));
  });
  app.get("/api/v1/fleets/:id", async (req: any, reply: any) => {
    requireUser(req);
    const fleet = store.get("fleets", (req.params as any).id);
    if (!fleet) return reply.status(404).send({ error: { code: "not_found", message: "fleet not found" } });
    return { ...fleet, devices: store.filter("devices", (d) => d.fleetId === fleet.id) };
  });

  app.get("/api/v1/devices", async (req: any) => {
    requireUser(req);
    const q = (req.query as any) ?? {};
    return store.filter("devices", (d) => !q.fleetId || d.fleetId === q.fleetId);
  });

  app.post("/api/v1/devices", async (req: any) => {
    const user = requireUser(req);
    const { fleetId, deviceRef, hardwareRevisionId, productLineId } = req.body ?? {};
    if (!fleetId || !deviceRef || !hardwareRevisionId || !productLineId) {
      throw { httpStatus: 400, code: "bad_request", message: "fleetId, deviceRef, hardwareRevisionId, productLineId required" } as any;
    }
    return store.put("devices", {
      fleetId, deviceRef, hardwareRevisionId, productLineId,
      organisationId: user.organisationId,
      status: "ONLINE",
      lastSeenAt: new Date().toISOString(),
    });
  });

  app.post("/api/v1/devices/:id/receipts", async (req: any) => {
    // Auth here is the DEVICE's own bearer credential (per-device key) — for the
    // simulator we accept the org user token or a device token.
    const user = requireUser(req);
    const deviceId = (req.params as any).id;
    return gov.ingestReceipt(user, deviceId, req.body ?? {});
  });

  app.get("/api/v1/devices/:id/receipts", async (req: any) => {
    requireUser(req);
    const deviceId = (req.params as any).id;
    return store.filter("receipts", (r) => r.deviceId === deviceId);
  });

  // -------------------------------------------------- incidents
  app.get("/api/v1/incidents", async (req: any) => {
    requireUser(req);
    const q = (req.query as any) ?? {};
    return gov.listIncidents({ releaseId: q.releaseId, status: q.status });
  });
  app.post("/api/v1/incidents", async (req: any) => {
    const user = requireUser(req);
    return gov.openIncident(user, (req.body as any)?.releaseId, req.body ?? {});
  });
  app.get("/api/v1/incidents/:id", async (req: any, reply: any) => {
    requireUser(req);
    const inc = store.get("incidents", (req.params as any).id);
    if (!inc) return reply.status(404).send({ error: { code: "not_found", message: "incident not found" } });
    return { ...inc, comments: store.filter("incidentComments", (c) => c.incidentId === inc.id) };
  });
  app.post("/api/v1/incidents/:id", async (req: any) => gov.updateIncident(requireUser(req), (req.params as any).id, req.body ?? {}));
  app.post("/api/v1/incidents/:id/comments", async (req: any) => gov.addIncidentComment(requireUser(req), (req.params as any).id, (req.body as any)?.body ?? ""));

  // -------------------------------------------------- signing keys
  app.post("/api/v1/keys", async (req: any) => keys.registerKey({ body: req.body ?? {}, actorUserId: requireUser(req).userId }));
  app.get("/api/v1/keys", async (req: any) => keys.historicalKeys(requireUser(req).organisationId));
  app.post("/api/v1/keys/:id/rotate", async (req: any) => keys.rotateKey((req.params as any).id, req.body ?? {}, requireUser(req).userId));
  app.post("/api/v1/keys/:id/revoke", async (req: any) => {
    const user = requireUser(req);
    return keys.revokeKey((req.params as any).id, user.userId, user.organisationId);
  });
  app.get("/api/v1/keys/manifest", async (req: any) => {
    const user = requireUser(req);
    return keys.keyManifest(user.organisationId);
  });

  // -------------------------------------------------- integrations
  app.get("/api/v1/integrations", async (req: any) => {
    requireUser(req);
    return store.list("otaIntegrations");
  });
  app.post("/api/v1/integrations/:id/verify", async (req: any, reply: any) => {
    requireUser(req);
    const integ = store.get("otaIntegrations", (req.params as any).id);
    if (!integ) return reply.status(404).send({ error: { code: "not_found", message: "integration not found" } });
    const adapter = adapterFor(integ, store);
    if (!adapter) return reply.status(400).send({ error: { code: "unsupported_adapter", message: integ.kind } });
    return adapter.verify();
  });

  // -------------------------------------------------- audit
  app.get("/api/v1/audit", async (req: any) => {
    requireUser(req);
    const q = (req.query as any) ?? {};
    const limit = Math.min(Number(q.limit ?? 100), 500);
    const events = store
      .list("auditLog")
      .sort((a, b) => b.sequence - a.sequence)
      .slice(0, limit);
    // chain integrity check
    let intact = true;
    const sorted = events.slice().sort((a, b) => a.sequence - b.sequence);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].prevHash !== sorted[i - 1].hash) intact = false;
    }
    return { intact, events };
  });

  // -------------------------------------------------- integrations registry
  app.get("/api/v1/health", async () => ({ ok: true }));
}

function adapterFor(integ: any, store: JsonStore) {
  switch (integ.kind) {
    case "simulator": return new SimulatorAdapter(store);
    case "mender": return new MenderAdapter(integ.baseUrl, process.env.MENDER_PAT ?? "REF_ONLY", `${integ.baseUrl}/inventory`);
    case "hawkbit": return new HawkbitAdapter(integ.baseUrl, process.env.HAWKBIT_TOKEN ?? "REF_ONLY");
    case "balena": return new BalenaAdapter(integ.baseUrl, process.env.BALENA_TOKEN ?? "REF_ONLY");
    default: return null;
  }
}

/** The RELEASE TRAIN view (spec section 10). */
export function buildReleaseTrain(store: JsonStore, releaseId: string, gov: GovernanceService) {
  const detail = gov.releaseDetail(releaseId);
  const security = detail.approvals.filter((a: any) => a.governanceRole === "SECURITY_REVIEWER")
    .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;
  const operator = detail.approvals.filter((a: any) => a.governanceRole === "OPERATOR")
    .sort((a: any, b: any) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;
  const securityName = security ? store.get("users", security.approverUserId)?.name ?? "reviewer" : undefined;
  const operatorName = operator ? store.get("users", operator.approverUserId)?.name ?? "operator" : undefined;
  const stepState = (needed: string[]): "done" | "active" | "rejected" | "pending" => {
    if (detail.status === "REJECTED" || detail.status === "REVOKED") return "rejected";
    if (needed.includes(detail.status)) return "done";
    return "pending";
  };
  const status = detail.status as string;
  return {
    releaseId,
    version: detail.manifest.version,
    productName: detail.productLine?.name,
    manufacturer: detail.manufacturer?.name,
    steps: [
      {
        name: "PROPOSED",
        state: ["PROPOSED", "SECURITY_APPROVED", "OPERATOR_APPROVED", "CANARY_RUNNING", "CANARY_PASSED", "CANARY_FAILED", "ROLLOUT_IN_PROGRESS", "PAUSED", "DEPLOYED"].includes(status) ? "done" : stepState([status]),
        by: detail.manufacturer?.name,
        when: detail.createdAt,
        decision: "release proposed by manufacturer",
        details: { securityNotes: detail.manifest.securityNotes, digest: detail.manifest.artifactDigestSha256 },
      },
      {
        name: "SECURITY REVIEW",
        state: security?.decision === "APPROVE" ? "done" : security ? "rejected" : stepState(["SECURITY_APPROVED", "OPERATOR_APPROVED", "CANARY_RUNNING", "CANARY_PASSED", "CANARY_FAILED", "ROLLOUT_IN_PROGRESS", "PAUSED", "DEPLOYED"].includes(status) ? [status] : []),
        by: securityName,
        when: security?.timestamp,
        decision: security ? `${security.decision} — by security reviewer ${securityName}` : undefined,
        comments: security?.comments,
        signatureRef: security?.signatureDigest,
      },
      {
        name: "OPERATOR APPROVAL",
        state: operator?.decision === "APPROVE" ? "done" : operator ? "rejected" : "pending",
        by: operatorName,
        when: operator?.timestamp,
        decision: operator ? `${operator.decision} — by operator ${operatorName}` : undefined,
        comments: operator?.comments,
        signatureRef: operator?.signatureDigest,
      },
      {
        name: "CANARY",
        state: ["CANARY_RUNNING"].includes(status) ? "active" : ["CANARY_PASSED", "CANARY_FAILED", "ROLLOUT_IN_PROGRESS", "PAUSED", "DEPLOYED", "ROLLBACK_AUTHORISED"].includes(status) ? (status === "CANARY_FAILED" ? "rejected" : "done") : "pending",
        when: detail.rolloutState?.stageStartedAt,
        details: { cohort: detail.rolloutState?.cohortDeviceIds?.length ?? null, progress: detail.rolloutState?.progress ?? null },
      },
      {
        name: "ROLLOUT",
        state: ["ROLLOUT_IN_PROGRESS", "PAUSED"].includes(status) ? "active" : ["DEPLOYED"].includes(status) ? "done" : "pending",
        when: detail.rolloutState?.stageStartedAt,
        details: { currentStage: detail.rolloutState?.currentStageOrder ?? null, progress: detail.rolloutState?.progress ?? null },
        incidents: detail.incidents?.length ?? 0,
      },
      {
        name: status === "PAUSED" ? "PAUSED" : status === "REVOKED" ? "REVOKED" : status === "SUPERSEDED" ? "SUPERSEDED" : status === "ROLLBACK_AUTHORISED" ? "ROLLBACK_AUTHORISED" : "DEPLOYED",
        state: status === "DEPLOYED" ? "done" : ["PAUSED", "REVOKED", "ROLLBACK_AUTHORISED", "CANARY_FAILED"].includes(status) ? "rejected" : "pending",
        when: status === "DEPLOYED" ? detail.updatedAt : undefined,
        details: { rollbackTarget: detail.rollbackTargetReleaseId ?? null },
      },
    ],
    approvals: detail.approvals,
    transactions: detail.transactions,
    receiptsSummary: detail.receiptsSummary,
    incidents: detail.incidents,
    manifest: detail.manifest,
  };
}
