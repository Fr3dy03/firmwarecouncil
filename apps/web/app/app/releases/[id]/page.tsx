"use client";

/**
 * RELEASE DETAIL CONTROL ROOM.
 * Header facts, release train (GET /releases/:id/pipeline), role/status-gated
 * action panel (security decisions, operator approval, canary, staged rollout,
 * revoke, rollback), manifest facts, pipeline cards, approvals timeline and
 * associated incidents.
 *
 * Server is the source of truth: client gating only hides actions; every
 * backend error is surfaced verbatim in the actions panel.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, useSession } from "../../../../lib/api";
import {
  Panel, PanelTitle, StatusPill, MonoRef, ReleaseTrain, ReleaseTrainStep, ApprovalTimeline,
  PipelineCard, IncidentBanner, Button, Modal, Field, inputStyle,
} from "../../../../components/fc/ui";
import { STATE_ACTIONS } from "@fc/shared/workflow";

interface ApprovalRec {
  id: string; approverUserId: string; approverOrganisationId: string;
  governanceRole: string; decision: string; timestamp: string; signatureDigest: string; comments: string;
}
interface Stage { id: string; order: number; kind: string; targetPercent: number; minDwellMinutes: number; requiresManualAdvance: boolean; autoHaltOnFailurePercent: number; }
interface Policy { id: string; canaryCohortSize: number; stages: Stage[]; requiresOperatorApproval: boolean; rollbackTargetReleaseId?: string | null; }
interface RollState {
  id: string; status: string; currentStageOrder: number; stageStartedAt?: string; startedAt?: string; pausedAt?: string;
  progress?: { eligibleDevices: number; contacted: number; successes: number; failures: number; offline: number };
}
interface IncidentRec { id: string; severity: string; status: string; title: string; failureReason: string; openedAt: string; }
interface TxRec { id: string; kind: string; status: string; hash?: string; createdAt: string; }

interface ReleaseDetail {
  id: string;
  status: string;
  createdAt: string;
  updatedAt?: string;
  organisationId?: string;
  productLineId: string;
  manifest: Record<string, any>;
  productLine?: { id: string; name: string; productName: string } | null;
  manufacturer?: { id: string; name: string } | null;
  approvals: ApprovalRec[];
  rolloutPolicy?: Policy | null;
  rolloutState?: RollState | null;
  fleetSize?: number;
  receiptsSummary?: { successes: number; failures: number };
  incidents: IncidentRec[];
  transactions: TxRec[];
  manufacturerSignatureAt?: string;
}
interface TrainResp { releaseId: string; steps: ReleaseTrainStep[]; }
interface ReleaseRow { id?: string; releaseId?: string; status: string; productLineId: string; manifest?: { version?: string }; }

type Phase = "SECURITY_REVIEW" | "OPERATOR_APPROVAL";
type Decision = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

/** decision e2e convention: sha256(`<releaseId>|<governanceRole>|<decision>`) */
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function ts(s?: string): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "7px 0", borderBottom: "1px solid var(--fc-border)", fontSize: 13 }}>
      <div style={{ width: 200, flexShrink: 0, color: "var(--fc-text-2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, paddingTop: 2 }}>{k}</div>
      <div style={mono ? { fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" } : undefined}>{v}</div>
    </div>
  );
}

const ROLE_FOR_ACTION: Record<string, string[]> = {
  "security-review": ["SECURITY_REVIEWER", "PLATFORM_ADMIN"],
  reject: ["SECURITY_REVIEWER", "OPERATOR", "PLATFORM_ADMIN"],
  "request-changes": ["SECURITY_REVIEWER", "PLATFORM_ADMIN"],
  "operator-approve": ["OPERATOR", "PLATFORM_ADMIN"],
  "open-canary": ["OPERATOR", "PLATFORM_ADMIN"],
  "record-canary-result": ["OPERATOR", "PLATFORM_ADMIN"],
  "advance-stage": ["OPERATOR", "PLATFORM_ADMIN"],
  pause: ["OPERATOR", "PLATFORM_ADMIN"],
  resume: ["OPERATOR", "PLATFORM_ADMIN"],
  "rollback-authorise": ["OPERATOR", "PLATFORM_ADMIN"],
  revoke: ["OPERATOR", "SECURITY_REVIEWER", "PLATFORM_ADMIN"],
};

export default function ReleaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const role = user?.role ?? "";

  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [trainSteps, setTrainSteps] = useState<ReleaseTrainStep[]>([]);
  const [allReleases, setAllReleases] = useState<ReleaseRow[]>([]);
  const [feedErr, setFeedErr] = useState("");
  const [actErr, setActErr] = useState("");
  const [actionBanner, setActionBanner] = useState("");
  const [busy, setBusy] = useState(false);

  // dialog + field refs (so the run closure always reads fresh values)
  const [dialog, setDialog] = useState<null | { title: string; body: React.ReactNode; danger?: boolean; run: () => Promise<void> }>(null);
  const comments = useRef("");
  const reason = useRef("");
  const targetReleaseId = useRef("");
  const overrideDigest = useRef("");

  const load = useCallback(async () => {
    setFeedErr("");
    try {
      const [d, train, rels] = await Promise.all([
        api<ReleaseDetail>(`/api/v1/releases/${id}`),
        api<TrainResp>(`/api/v1/releases/${id}/pipeline`),
        api<ReleaseRow[]>("/api/v1/releases"),
      ]);
      setDetail(d);
      setTrainSteps((train?.steps ?? []) as ReleaseTrainStep[]);
      setAllReleases(rels);
    } catch (e) {
      setFeedErr((e as Error)?.message ?? String(e));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const statusActions: string[] = detail ? (STATE_ACTIONS as Record<string, string[]>)[detail.status] ?? [] : [];
  const may = (action: string) => ROLE_FOR_ACTION[action] != null && ROLE_FOR_ACTION[action].includes(role);

  const decisionPhase: Phase | null =
    detail && ["PROPOSED", "CHANGES_REQUESTED"].includes(detail.status) ? "SECURITY_REVIEW"
      : detail && detail.status === "SECURITY_APPROVED" ? "OPERATOR_APPROVAL"
      : null;

  // ------------------------------------------------------------------ actions
  async function postDecision(decision: Decision, phase: Phase) {
    setBusy(true); setActErr(""); setActionBanner("");
    try {
      const govRole = phase === "SECURITY_REVIEW" ? "SECURITY_REVIEWER" : "OPERATOR";
      const digest = overrideDigest.current.trim() || (await sha256Hex(`${id}|${govRole}|${decision}`));
      const endpoint = decision === "APPROVE" ? "approve" : decision === "REJECT" ? "reject" : "request-changes";
      await api(`/api/v1/releases/${id}/${endpoint}`, {
        method: "POST",
        body: { phase, comments: comments.current, signatureDigest: digest },
      });
      setActionBanner(`Decision ${decision} recorded (${phase}).`);
      await load();
    } catch (e) {
      setActErr((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function postRollout(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true); setActErr(""); setActionBanner("");
    try {
      await api(`/api/v1/releases/${id}/rollout`, { method: "POST", body: { action, ...extra } });
      setActionBanner(`Rollout action “${action}” applied.`);
      await load();
    } catch (e) {
      setActErr((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function openDecision(decision: Decision) {
    if (!decisionPhase) return;
    const phase = decisionPhase;
    comments.current = ""; overrideDigest.current = "";
    setDialog({
      title: `${phase === "SECURITY_REVIEW" ? "Security review" : "Operator approval"} — ${decision}`,
      danger: decision !== "APPROVE",
      body: (
        <>
          <Field label="Comments">
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: "vertical" }}
              value={comments.current}
              onChange={(e) => { comments.current = e.target.value; setDialog((d) => (d ? { ...d } : d)); }}
            />
          </Field>
          <div style={{ fontSize: 12, color: "var(--fc-text-2)", marginBottom: 10 }}>
            Signature digest auto-derived per the council convention (e2e.mts):{" "}
            <span className="mono">sha256(&quot;{id.slice(0, 8)}…&quot;|{phase === "SECURITY_REVIEW" ? "SECURITY_REVIEWER" : "OPERATOR"}|{decision})</span>
          </div>
          <details style={{ fontSize: 12.5 }}>
            <summary style={{ cursor: "pointer", color: "var(--fc-text-2)" }}>Advanced — override signature digest</summary>
            <input
              className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 8 }}
              defaultValue=""
              onChange={(e) => { overrideDigest.current = e.target.value; }}
              placeholder="64-hex digest (leave blank to auto-derive)"
            />
          </details>
        </>
      ),
      run: () => postDecision(decision, phase),
    });
  }

  function openSimple(action: string, title: string, intro: string, withReason: "required" | "optional" | "none") {
    reason.current = "";
    setDialog({
      title,
      danger: action === "revoke",
      body: (
        <>
          <div style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 14 }}>{intro}</div>
          {withReason !== "none" ? (
            <Field label={withReason === "required" ? "Reason (required)" : "Reason (optional)"}>
              <textarea
                style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
                value={reason.current}
                onChange={(e) => { reason.current = e.target.value; setDialog((d) => (d ? { ...d } : d)); }}
              />
            </Field>
          ) : null}
        </>
      ),
      run: async () => {
        if (withReason === "required" && !reason.current.trim()) {
          setActErr(`A reason is required for “${action}”.`);
          return;
        }
        if (action === "revoke") await postRollout("revoke", { reason: reason.current });
        else if (action === "pause") await postRollout("pause", { reason: reason.current });
        else if (action === "resume") await postRollout("resume", { notes: reason.current });
        else if (action === "advance") await postRollout("advance", {});
        else if (action === "open-canary") await postRollout("open-canary", {});
        else if (action === "authorise-rollout") await postRollout("authorise-rollout", {});
      },
    });
  }

  function openRecordCanary(success: boolean) {
    reason.current = "";
    setDialog({
      title: success ? "Record canary result — success" : "Record canary result — failure",
      danger: !success,
      body: (
        <>
          <div style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 14 }}>
            {success
              ? "Records CANARY_PASSED — the release becomes eligible for authorising the staged rollout."
              : "Records CANARY_FAILED — an incident is opened automatically and the release halts."}
          </div>
          <Field label="Reason / evidence note (required on failure)">
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={reason.current}
              onChange={(e) => { reason.current = e.target.value; setDialog((d) => (d ? { ...d } : d)); }}
            />
          </Field>
        </>
      ),
      run: async () => {
        if (!success && !reason.current.trim()) { setActErr("A failure reason is required."); return; }
        await postRollout("record-canary-result", { success, reason: reason.current });
      },
    });
  }

  function openRollback() {
    reason.current = ""; targetReleaseId.current = "";
    const eligible = allReleases.filter((r) => (r.id ?? r.releaseId) !== id && r.productLineId === detail?.productLineId && ["DEPLOYED", "ROLLBACK_AUTHORISED"].includes(r.status));
    setDialog({
      title: "Authorise rollback",
      danger: true,
      body: (
        <>
          <div style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 14 }}>
            Authorises return to a previously DEPLOYED release on the same product line.
          </div>
          <Field label="Rollback target release (required)">
            <select
              style={inputStyle}
              defaultValue=""
              onChange={(e) => { targetReleaseId.current = e.target.value; setDialog((d) => (d ? { ...d } : d)); }}
            >
              <option value="">— select target —</option>
              {eligible.map((r) => {
                const rid = r.id ?? r.releaseId ?? "";
                return <option key={rid} value={rid}>v{r.manifest?.version} · {r.status} · {rid.slice(0, 8)}…</option>;
              })}
            </select>
          </Field>
          <Field label="Reason (required)">
            <textarea
              style={{ ...inputStyle, minHeight: 70, resize: "vertical" }}
              value={reason.current}
              onChange={(e) => { reason.current = e.target.value; setDialog((d) => (d ? { ...d } : d)); }}
            />
          </Field>
        </>
      ),
      run: async () => {
        if (!targetReleaseId.current) { setActErr("Select a rollback target release."); return; }
        if (!reason.current.trim()) { setActErr("A rollback reason is required."); return; }
        await postRollout("rollback", { targetReleaseId: targetReleaseId.current, reason: reason.current });
      },
    });
  }

  // action catalogue for the current status/role
  const status = detail?.status ?? "";
  const actionsActive = (() => {
    const a: Array<{ key: string; label: string; danger?: boolean; onClick: () => void; sub?: string }> = [];
    if (!detail || !decisionPhase) return a;
    if (decisionPhase === "SECURITY_REVIEW" && may("security-review")) {
      a.push({ key: "approve", label: "Security APPROVE", sub: "PROPOSED / CHANGES_REQUESTED", onClick: () => openDecision("APPROVE") });
      a.push({ key: "request-changes", label: "Request changes", danger: true, sub: "→ CHANGES_REQUESTED", onClick: () => openDecision("REQUEST_CHANGES") });
      if (may("reject") && ["PROPOSED"].includes(detail.status)) {
        a.push({ key: "reject", label: "Reject outright", danger: true, sub: "→ REJECTED", onClick: () => openDecision("REJECT") });
      }
    }
    if (decisionPhase === "OPERATOR_APPROVAL" && may("operator-approve")) {
      a.push({ key: "agent-approve", label: "Operator APPROVE", sub: "→ OPERATOR_APPROVED", onClick: () => openDecision("APPROVE") });
    }
    if (status === "OPERATOR_APPROVED" && may("open-canary")) {
      a.push({ key: "open-canary", label: "Open canary", sub: "pull cohort from fleet", onClick: () => openSimple("open-canary", "Open canary cohort", "Pulls the first `canaryCohortSize` devices from the product line's fleet into the canary cohort.", "none") });
    }
    if (["CANARY_RUNNING", "CANARY_FAILED"].includes(status) && may("record-canary-result")) {
      a.push({ key: "canary-ok", label: "Record canary SUCCESS", sub: "→ CANARY_PASSED", onClick: () => openRecordCanary(true) });
      a.push({ key: "canary-fail", label: "Record canary FAILURE", danger: true, sub: "opens incident", onClick: () => openRecordCanary(false) });
    }
    if (status === "CANARY_PASSED" && ["OPERATOR", "PLATFORM_ADMIN"].includes(role)) {
      a.push({ key: "authorise", label: "Authorise staged rollout", sub: "→ ROLLOUT_IN_PROGRESS", onClick: () => openSimple("authorise-rollout", "Authorise staged rollout", "Starts stage 1 of the rollout policy. Canary cohort devices keep their status.", "none") });
    }
    if (status === "ROLLOUT_IN_PROGRESS" && may("advance-stage")) {
      a.push({ key: "advance", label: "Advance stage", sub: "next policy stage or DEPLOYED", onClick: () => openSimple("advance", "Advance rollout stage", "Advances to the next stage of the policy; beyond the final stage the release is marked DEPLOYED.", "none") });
    }
    if (["CANARY_RUNNING", "ROLLOUT_IN_PROGRESS"].includes(status) && may("pause")) {
      a.push({ key: "pause", label: "Pause release", danger: true, sub: "→ PAUSED", onClick: () => openSimple("pause", "Pause rollout", "Halts the release. Resumes only via the operator resume action.", "required") });
    }
    if (status === "PAUSED" && may("resume")) {
      a.push({ key: "resume", label: "Resume rollout", sub: "→ ROLLOUT_IN_PROGRESS", onClick: () => openSimple("resume", "Resume rollout", "Returns the paused release to ROLLOUT_IN_PROGRESS.", "optional") });
    }
    if (["CANARY_FAILED", "PAUSED", "ROLLOUT_IN_PROGRESS", "DEPLOYED"].includes(status) && may("rollback-authorise")) {
      a.push({ key: "rollback", label: "Authorise rollback", danger: true, sub: "→ ROLLBACK_AUTHORISED", onClick: openRollback });
    }
    if (may("revoke") && !["REVOKED", "SUPERSEDED", "ROLLBACK_AUTHORISED"].includes(status)) {
      a.push({ key: "revoke", label: "Revoke release", danger: true, sub: "→ REVOKED", onClick: () => openSimple("revoke", "Revoke release", "Revokes the release across the council; the device fleet must not install it.", "required") });
    }
    return a;
    function May() { return true; }
  })();

  // ------------------------------------------------------------------ pipeline cards
  const policy = detail?.rolloutPolicy ?? null;
  const state = detail?.rolloutState ?? null;
  const stageState = (order: number): string => {
    if (!state) return "PENDING";
    if (state.status === "COMPLETED") return "SUCCESS";
    if (order < state.currentStageOrder) return "SUCCESS";
    if (order === state.currentStageOrder) {
      if (status === "PAUSED") return "PAUSED";
      if (status === "CANARY_FAILED" && order === 0) return "CANARY_FAILED";
      if (status === "CANARY_RUNNING" && order === 0) return "CANARY_RUNNING";
      if (status === "ROLLOUT_IN_PROGRESS") return "ROLLOUT_IN_PROGRESS";
      return "SUCCESS";
    }
    return "PENDING";
  };

  // ------------------------------------------------------------------ timeline
  const timeline: Array<{ title: string; when: string; body: React.ReactNode; tone?: "ok" | "warn" | "bad" | "info" }> = [];
  if (detail) {
    timeline.push({
      title: "Release proposed",
      when: detail.createdAt,
      body: <>status set to <StatusPill status="PROPOSED" small />{detail.manufacturer ? <> by {detail.manufacturer.name}</> : null}</>,
      tone: "info",
    });
    if (detail.manufacturerSignatureAt) {
      timeline.push({
        title: "Manufacturer signature registered",
        when: detail.manufacturerSignatureAt,
        body: <span className="mono">verified against org ACTIVE key · stored ref <MonoRef value={detail.manifest?.manifestDigest} max={12} /></span>,
        tone: "info",
      });
    }
    for (const ap of detail.approvals ?? []) {
      timeline.push({
        title: `${ap.decision} — ${ap.governanceRole.replace(/_/g, " ").toLowerCase()}`,
        when: ap.timestamp,
        body: (
          <>
            {ap.comments ? <span style={{ fontStyle: "italic" }}>“{ap.comments}”</span> : null}
            <span style={{ display: "block", marginTop: 4 }}>
              sig <span className="mono">{ap.signatureDigest.slice(0, 24)}…</span>
            </span>
          </>
        ),
        tone: ap.decision === "APPROVE" ? "ok" : ap.decision === "REJECT" ? "bad" : "warn",
      } as any);
    }
  }

  // ------------------------------------------------------------------ render
  return (
    <div>
      {feedErr ? (
        <Panel style={{ marginBottom: 20, borderLeft: "3px solid var(--fc-red)" }}>
          <PanelTitle>Feed error</PanelTitle>
          <p style={{ fontSize: 13.5, color: "var(--fc-red)" }}>{feedErr}</p>
          <Button variant="ghost" onClick={() => void load()}>Retry</Button>
        </Panel>
      ) : null}

      {!detail && !feedErr ? <p className="mono" style={{ color: "var(--fc-text-2)", fontSize: 12 }}>▍ loading release…</p> : null}

      {detail ? (
        <>
          <div style={{ marginBottom: 18 }}>
            <Link href="/app/releases" style={{ fontSize: 12.5 }}>← Release register</Link>
          </div>

          {/* header */}
          <Panel style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <h2 className="mono" style={{ fontSize: "1.55rem", color: "var(--fc-navy)" }}>v{detail.manifest?.version}</h2>
              <StatusPill status={detail.status} />
              <span style={{ color: "var(--fc-text-2)", fontSize: 13.5 }}>
                {detail.productLine?.name ?? "—"} · {detail.manufacturer?.name ?? "—"} · created {ts(detail.createdAt)}
              </span>
              <span style={{ flex: 1 }} />
              <Button variant="ghost" onClick={() => void load()} disabled={busy}>Refresh</Button>
            </div>
            <div style={{ display: "flex", gap: 26, marginTop: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <span style={{ fontSize: 11, color: "var(--fc-text-2)", fontWeight: 600 }}>MANIFEST DIGEST</span>
              <MonoRef value={detail.manifest?.manifestDigest} max={22} />
              <span style={{ fontSize: 11, color: "var(--fc-text-2)", fontWeight: 600 }}>ARTIFACT DIGEST</span>
              <MonoRef value={detail.manifest?.artifactDigestSha256} max={22} />
            </div>
          </Panel>

          {/* release train */}
          <Panel style={{ marginBottom: 22 }}>
            <PanelTitle right={<span style={{ fontSize: 11, color: "var(--fc-text-2)" }}>GET /releases/{String(id).slice(0, 8)}…/pipeline</span>}>Release train</PanelTitle>
            {trainSteps.length ? (
              <ReleaseTrain steps={trainSteps} />
            ) : (
              <p style={{ color: "var(--fc-text-2)", fontSize: 13 }}>Pipeline unavailable.</p>
            )}
          </Panel>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 22 }}>
            <div style={{ display: "grid", gap: 22 }}>
              {/* manifest */}
              <Panel>
                <PanelTitle>Manifest facts</PanelTitle>
                <KV k="Version" v={<span className="mono">{detail.manifest?.version}</span>} />
                <KV k="Build identifier" v={<span className="mono">{detail.manifest?.buildIdentifier}</span>} />
                <KV k="Target revisions" v={<span className="mono">{(detail.manifest?.targetRevisions ?? []).join(" · ") || "—"}</span>} />
                <KV k="Artifact digest" v={<span className="mono">{detail.manifest?.artifactDigestSha256}</span>} mono />
                <KV k="Artifact size" v={<span className="mono">{detail.manifest?.artifactSizeBytes != null ? `${detail.manifest.artifactSizeBytes.toLocaleString()} bytes` : "—"}</span>} />
                <KV k="Artifact URL" v={<span className="mono" style={{ wordBreak: "break-all" }}>{detail.manifest?.artifactUrl}</span>} />
                <KV k="Compatibility" v={detail.manifest?.productCompatibility || "—"} />
                <KV k="Security notes" v={detail.manifest?.securityNotes || "(none)"} />
                <KV k="Previous release" v={detail.manifest?.previousReleaseId ? <span className="mono">{String(detail.manifest.previousReleaseId)}</span> : "—"} />
                <KV k="Manifest digest" v={<span className="mono">{detail.manifest?.manifestDigest}</span>} mono />
              </Panel>

              {/* pipeline */}
              <Panel>
                <PanelTitle>Staged pipeline & progress</PanelTitle>
                {policy && policy.stages?.length ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }}>
                      <PipelineCard
                        title="CANARY"
                        state={!state || state.currentStageOrder === 0 ? stageState(0) : "SUCCESS"}
                        meta={<>cohort {policy.canaryCohortSize} device(s){state?.currentStageOrder === 0 ? " · in progress" : state ? " · completed" : ""}</>}
                      />
                      {policy.stages.map((s) => (
                        <PipelineCard
                          key={s.id}
                          title={`STAGE ${s.order} · ${s.kind}`}
                          state={stageState(s.order)}
                          meta={<>{s.targetPercent}% · dwell ≥ {s.minDwellMinutes} min · {s.requiresManualAdvance ? "manual advance" : "auto advance"} · halt @{s.autoHaltOnFailurePercent}%</>}
                        />
                      ))}
                    </div>
                    {state?.progress ? (
                      <div style={{ display: "flex", gap: 24, fontSize: 13, color: "var(--fc-slate)" }}>
                        <span>eligible <strong className="mono">{state.progress.eligibleDevices}</strong></span>
                        <span>contacted <strong className="mono">{state.progress.contacted}</strong></span>
                        <span style={{ color: "var(--fc-green)" }}>successes <strong className="mono">{state.progress.successes}</strong></span>
                        <span style={{ color: "var(--fc-red)" }}>failures <strong className="mono">{state.progress.failures}</strong></span>
                        <span>offline <strong className="mono">{state.progress.offline}</strong></span>
                      </div>
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>No rollout state yet — canary has not been opened.</p>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>No rollout policy attached to this release.</p>
                )}
              </Panel>

              {/* timeline */}
              <Panel>
                <PanelTitle>Approvals timeline</PanelTitle>
                {timeline.length ? <ApprovalTimeline events={timeline as any} /> : <p style={{ color: "var(--fc-text-2)", fontSize: 13 }}>No approval records yet.</p>}
              </Panel>
            </div>

            <div style={{ display: "grid", gap: 22, alignContent: "start" }}>
              {/* actions */}
              <Panel>
                <PanelTitle right={<span style={{ fontSize: 11, color: "var(--fc-text-2)" }}>{role.replace(/_/g, " ").toLowerCase()} view</span>}>Governance actions</PanelTitle>
                {actErr ? (
                  <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
                    {actErr}
                  </div>
                ) : null}
                {actionBanner && !actErr ? (
                  <div style={{ border: "1px solid var(--fc-green)", background: "#E9F3EE", color: "var(--fc-green)", borderRadius: 4, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
                    {actionBanner}
                  </div>
                ) : null}
                {actionsActive.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
                    No gated action for your role at status <span className="mono">{status}</span>. (
                    {statusActions.length ? `status allows: ${statusActions.join(", ")}` : "status allows no actions"})
                  </p>
                ) : (
                  <div style={{ display: "grid", gap: 9 }}>
                    {actionsActive.map((a) => (
                      <div key={a.key} style={{ border: "1px solid var(--fc-border)", borderRadius: 4, padding: "10px 12px", display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fc-navy)" }}>{a.label}</div>
                          {a.sub ? <div className="mono" style={{ fontSize: 11, color: "var(--fc-text-2)" }}>{a.sub}</div> : null}
                        </div>
        <Button variant={a.danger ? "danger" : "ghost"} onClick={a.onClick} disabled={busy}>{a.danger ? "Execute ›" : "Open ›"}</Button>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* incidents */}
              <Panel>
                <PanelTitle>Incidents ({detail.incidents?.length ?? 0})</PanelTitle>
                {detail.incidents?.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {detail.incidents.map((i) => (
                      <IncidentBanner key={i.id} severity={i.severity === "HIGH" || i.severity === "CRITICAL" ? "HIGH" : i.severity} title={`${i.status} · ${i.title}`} detail={`${i.failureReason} · opened ${ts(i.openedAt)}`} />
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>No incidents associated with this release.</p>
                )}
              </Panel>

              {/* chain transactions */}
              <Panel>
                <PanelTitle>Chain transactions</PanelTitle>
                {(detail.transactions ?? []).length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>No on-chain transactions recorded yet.</p>
                ) : (
                  (detail.transactions ?? []).slice(-5).reverse().map((t) => (
                    <KV key={t.id} k={t.kind} v={<><span className="mono">{t.hash ?? "(pending)"}</span> · {t.status}</>} />
                  ))
                )}
              </Panel>
            </div>
          </div>

          {/* action dialog */}
          {dialog ? (
            <Modal
              title={dialog.title}
              onClose={() => setDialog(null)}
              width={540}
              footer={
                <>
                  <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
                  <Button
                    variant={dialog.danger ? "danger" : "primary"}
                    disabled={busy}
                    onClick={() => { const run = dialog.run; setDialog(null); void run(); }}
                  >
                    {busy ? "Working…" : "Confirm"}
                  </Button>
                </>
              }
            >
              {dialog.body}
            </Modal>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
