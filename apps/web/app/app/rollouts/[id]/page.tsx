"use client";

/**
 * Rollout control room (id = release id).
 * Endpoints (exact, from apps/api/src/routes/index.mts):
 *  GET  /api/v1/releases/:id        → detail {manifest, status, productLine,
 *       manufacturer, approvals, rolloutPolicy, rolloutState, fleetSize,
 *       receiptsSummary, incidents, transactions, rollbackTargetReleaseId}
 *  GET  /api/v1/releases/:id/pipeline → RELEASE TRAIN steps (e2e.mts usage)
 *  POST /api/v1/releases/:id/rollout body {action, stageOrder?, reason?,
 *       notes?, targetReleaseId?} — actions: open-canary, record-canary-result,
 *       authorise-rollout, advance, pause, resume, revoke, rollback, supersede.
 * Every mutation is confirmed (ConfirmDialog / reason modal) and errors render inline.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError, useSession } from "../../../../lib/api";
import {
  Button, ConfirmDialog, DataTable, EmptyState, Field, Metric, Modal, Panel, PanelTitle,
  PipelineCard, StatusPill, inputStyle,
} from "../../../../components/fc/ui";

interface RolloutPolicyStage {
  id: string;
  order: number;
  kind: string;
  targetPercent: number;
  minDwellMinutes: number;
  requiresManualAdvance: boolean;
  autoHaltOnFailurePercent: number;
}

interface ReleaseDetail {
  id: string;
  status: string;
  productLine: { id: string; name: string; productName: string } | null;
  manifest: { version: string; artifactDigestSha256: string };
  manufacturer?: { id: string; name: string } | null;
  rolloutPolicy: { id: string; canaryCohortSize: number; stages: RolloutPolicyStage[]; rollbackTargetReleaseId?: string | null } | null;
  rollbackTargetReleaseId?: string | null;
  rolloutState: {
    status: string;
    currentStageOrder: number;
    stageStartedAt?: string | null;
    cohortDeviceIds?: string[];
    progress: { eligibleDevices: number; contacted: number; successes: number; failures: number; offline: number };
  } | null;
  receiptsSummary: { successes: number; failures: number };
  incidents: Array<{ id: string; title: string; severity: string; status: string; failureReason: string }>;
}

interface PipelineStep {
  name: string;
  state: "done" | "active" | "rejected" | "pending";
  by?: string;
  when?: string;
  decision?: string;
}

interface ReleaseRow {
  id: string;
  status: string;
  productLineId: string;
  manifest: { version: string };
}

type MutateAction = "advance" | "pause" | "resume" | "rollback";

export default function RolloutControlRoomPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useSession();

  const [detail, setDetail] = useState<ReleaseDetail | null>(null);
  const [steps, setSteps] = useState<PipelineStep[]>([]);
  const [rollbackTargets, setRollbackTargets] = useState<ReleaseRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<{ action: MutateAction; label: string; body: string } | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState("");
  const [rollbackReason, setRollbackReason] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      const [d, pipe] = await Promise.allSettled([
        api<ReleaseDetail>(`/api/v1/releases/${id}`),
        api<{ steps: PipelineStep[] }>(`/api/v1/releases/${id}/pipeline`),
      ]);
      if (d.status === "rejected") {
        setDetail(null);
        setError(d.reason instanceof ApiError ? `${d.reason.message} (${d.reason.code})` : String(d.reason));
      } else {
        setDetail(d.value);
        setSteps(pipe.status === "fulfilled" ? pipe.value.steps : []);
      }
      if (d.status === "fulfilled" && d.value.productLine) {
        // rollback targets: DEPLOYED releases on the same product line
        try {
          const all = await api<ReleaseRow[]>("/api/v1/releases");
          setRollbackTargets(all.filter((r) => r.productLineId === d.value.productLine?.id && r.status === "DEPLOYED" && r.id !== id));
        } catch { /* rollback targets unavailable — select stays empty */ }
      }
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function mutate(action: MutateAction, body: Record<string, unknown>) {
    if (!id) return;
    setMutating(true);
    setActionError(null);
    try {
      await api(`/api/v1/releases/${id}/rollout`, { method: "POST", body: { action, ...body } });
      setConfirmAction(null);
      setPauseOpen(false);
      setRollbackOpen(false);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
      setConfirmAction(null);
      setPauseOpen(false);
      setRollbackOpen(false);
    } finally {
      setMutating(false);
    }
  }

  if (busy) return <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading control room…</div>;
  if (!detail) {
    return (
      <EmptyState
        title="Release not found"
        body={error ?? "No release exists with this identifier."}
        action={<Link href="/app/rollouts" style={{ fontSize: 13 }}>Back to rollouts</Link>}
      />
    );
  }

  const isOperator = user?.role === "OPERATOR";
  const isAdmin = user?.role === "PLATFORM_ADMIN";
  const canControl = isOperator || isAdmin;
  const st = detail.rolloutState;
  const progress = st?.progress ?? { eligibleDevices: 0, contacted: 0, successes: 0, failures: 0, offline: 0 };
  const stages = detail.rolloutPolicy?.stages ?? [];
  const stageLabel: Record<number, string> = { 0: "CANARY", 1: "SMALL", 2: "MEDIUM", 3: "LARGE", 4: "FULL" };
  const showIncident = detail.incidents.length > 0 && (detail.status === "PAUSED" || detail.status === "CANARY_FAILED" || detail.status === "REVOKED" || detail.status === "ROLLBACK_AUTHORISED");
  const canResume = detail.status === "PAUSED" && isOperator;
  const canPause = ["CANARY_RUNNING", "CANARY_PASSED", "CANARY_FAILED", "ROLLOUT_IN_PROGRESS"].includes(detail.status) && canControl;
  const canAdvance = detail.status === "ROLLOUT_IN_PROGRESS" && isOperator;
  const canRollback = ["CANARY_FAILED", "PAUSED", "DEPLOYED", "ROLLOUT_IN_PROGRESS"].includes(detail.status) && isOperator;

  // ---- canary + staged cards ------------------------------------------------
  const canaryState =
    detail.status === "CANARY_RUNNING" ? "CANARY_RUNNING" :
    detail.status === "CANARY_FAILED" ? "CANARY_FAILED" :
    ["ROLLOUT_IN_PROGRESS", "PAUSED", "DEPLOYED"].includes(detail.status) ? "CANARY_PASSED" :
    "PROPOSED";

  const stageCards = stages.map((s) => {
    const state =
      st && s.order < st.currentStageOrder ? "CANARY_PASSED" :
      st && s.order === st.currentStageOrder ? (detail.status === "PAUSED" ? "PAUSED" : "ROLLOUT_IN_PROGRESS") :
      "PROPOSED";
    return (
      <PipelineCard
        key={s.id}
        title={`STAGE ${s.order} · ${s.kind}`}
        state={state}
        meta={
          <>
            <div>Target <span className="mono">{s.targetPercent}%</span> of eligible fleet · min dwell <span className="mono">{s.minDwellMinutes} min</span></div>
            <div style={{ color: "var(--fc-text-2)", fontSize: 11.5 }}>
              {s.requiresManualAdvance ? "requires manual advance" : "auto-advance"} · auto-halt at <span className="mono">{s.autoHaltOnFailurePercent}%</span> failures
            </div>
            {st && s.order === st.currentStageOrder ? (
              <div style={{ marginTop: 6, fontSize: 11.5 }} className="mono">
                contacted {progress.contacted}/{progress.eligibleDevices} · ok {progress.successes} · fail {progress.failures} · offline {progress.offline}
              </div>
            ) : null}
          </>
        }
      />
    );
  });

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Rollout control room</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>
            v{detail.manifest.version} <span style={{ fontWeight: 400, color: "var(--fc-text-2)" }}>— {detail.productLine?.name ?? detail.id}</span>
          </h1>
          <div style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
            rollout state <span className="mono">{st?.status ?? "PRE_CANARY"}</span> · current stage <span className="mono">{stageLabel[st?.currentStageOrder ?? 0] ?? (st?.currentStageOrder ?? 0)}</span> · factory of record {detail.manufacturer?.name ?? "—"}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link href={`/app/releases/${detail.id}`} style={{ fontSize: 13 }}>Release record</Link>
          <StatusPill status={detail.status} />
        </div>
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      {/* incident banner + link */}
      {showIncident && detail.incidents[0] ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ border: "1px solid var(--fc-red)", borderLeftWidth: 4, borderRadius: 4, background: "#F9E9E8", padding: "12px 16px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fc-red)" }}>
              {detail.incidents[0].severity} — {detail.incidents[0].title}
            </div>
            <div style={{ fontSize: 13, color: "var(--fc-slate)", marginTop: 2 }}>{detail.incidents[0].failureReason}</div>
          </div>
          <Link href={`/app/incidents/${detail.incidents[0].id}`} style={{ fontSize: 13 }}>Open incident →</Link>
        </div>
      ) : null}

      {/* progress metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
        <Metric label="Eligible devices" value={progress.eligibleDevices} hint={st?.cohortDeviceIds ? `canary cohort ${st.cohortDeviceIds.length}` : undefined} />
        <Metric label="Contacted" value={progress.contacted} />
        <Metric label="Successes" value={progress.successes} tone="ok" />
        <Metric label="Failures" value={progress.failures} tone={progress.failures > 0 ? "bad" : undefined} />
        <Metric label="Offline" value={progress.offline} />
        <Metric label="Receipts summary" value={`${detail.receiptsSummary?.successes ?? 0} / ${detail.receiptsSummary?.failures ?? 0}`} hint="success / failure receipts" />
      </div>

      {/* stage cards: canary first, then the policy stages */}
      <Panel>
        <PanelTitle
          right={
            canControl ? (
              <div style={{ display: "flex", gap: 8 }}>
                {canAdvance ? (
                  <Button variant="secondary" disabled={mutating} onClick={() => setConfirmAction({
                    action: "advance",
                    label: "Advance to next stage",
                    body: advanceBodyText(stageLabel, st?.currentStageOrder ?? 0, stages),
                  })}>Advance to next stage</Button>
                ) : null}
                {canPause ? (
                  <Button variant="ghost" disabled={mutating} onClick={() => { setPauseReason(""); setPauseOpen(true); }}>Pause</Button>
                ) : null}
                {canResume ? (
                  <Button variant="secondary" disabled={mutating} onClick={() => setConfirmAction({
                    action: "resume",
                    label: "Resume rollout",
                    body: "The release returns to ROLLOUT_IN_PROGRESS at the same stage. Confirm the situation that caused the pause has been mitigated.",
                  })}>Resume</Button>
                ) : null}
                {canRollback ? (
                  <Button variant="danger" disabled={mutating} onClick={() => { setRollbackTarget(rollbackTargets[0]?.id ?? ""); setRollbackReason(""); setRollbackOpen(true); }}>Rollback</Button>
                ) : null}
              </div>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>read-only for this role</span>
            )
          }
        >
          Release train — CANARY + STAGES
        </PanelTitle>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            <PipelineCard
              title="CANARY"
              state={canaryState}
              meta={
                <>
                  <div>Cohort size <span className="mono">{detail.rolloutPolicy?.canaryCohortSize ?? st?.cohortDeviceIds?.length ?? "—"}</span></div>
                  <div style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>small fixed cohort submits signed receipts before staged rollout</div>
                </>
              }
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
            {stageCards}
            {stages.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>
                No staged rollout policy is attached to this release — the canary gates deployment directly.
              </div>
            ) : null}
          </div>
        </div>
      </Panel>

      {/* train steps from the pipeline endpoint */}
      {steps.length > 0 ? (
        <Panel>
          <PanelTitle>Governance gates (pipeline report)</PanelTitle>
          <DataTable
            minWidth={640}
            columns={[
              { key: "step", label: "Step" },
              { key: "state", label: "State" },
              { key: "by", label: "By" },
              { key: "when", label: "When" },
              { key: "decision", label: "Decision" },
            ]}
            rows={steps.map((s) => ({
              step: <span style={{ fontWeight: 600, color: "var(--fc-navy)", fontSize: 13 }}>{s.name}</span>,
              state: <StatusPill status={s.state === "done" ? "CANARY_PASSED" : s.state === "active" ? "CANARY_RUNNING" : s.state === "rejected" ? "REJECTED" : "PROPOSED"} small />,
              by: <span style={{ fontSize: 12.5 }}>{s.by ?? "—"}</span>,
              when: <span className="mono" style={{ fontSize: 11 }}>{s.when ? new Date(s.when).toLocaleString() : "—"}</span>,
              decision: <span style={{ fontSize: 12.5, color: "var(--fc-slate)" }}>{s.decision ?? "—"}</span>,
            }))}
          />
        </Panel>
      ) : null}

      {actionError ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {actionError}
        </div>
      ) : null}

      {/* confirm advance / resume */}
      {confirmAction ? (
        <ConfirmDialog
          title={confirmAction.label}
          body={confirmAction.body}
          confirmLabel={mutating ? "Working…" : "Confirm"}
          onConfirm={() => { void mutate(confirmAction.action, confirmAction.action === "resume" ? { notes: "resumed from control room" } : {}); }}
          onClose={() => setConfirmAction(null)}
        />
      ) : null}

      {/* pause with reason */}
      {pauseOpen ? (
        <Modal
          title="Pause rollout"
          onClose={() => setPauseOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setPauseOpen(false)}>Cancel</Button>
              <Button disabled={mutating} onClick={() => { void mutate("pause", { reason: pauseReason.trim() }); }}>
                {mutating ? "Pausing…" : "Pause rollout"}
              </Button>
            </>
          }
        >
          <Field label="Reason (recorded on the audit chain, pushed to the incident record)">
            <textarea style={{ ...inputStyle, minHeight: 90 }} value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder="e.g. elevated failure reports from cohort stage" />
          </Field>
          <div style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
            Pausing is available to the OPERATOR role (and platform admin). The release becomes PAUSED until resumed.
          </div>
        </Modal>
      ) : null}

      {/* rollback with target + reason */}
      {rollbackOpen ? (
        <Modal
          title="Authorise rollback"
          onClose={() => setRollbackOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRollbackOpen(false)}>Cancel</Button>
              <Button variant="danger" disabled={mutating || !rollbackTarget} onClick={() => { void mutate("rollback", { targetReleaseId: rollbackTarget, reason: rollbackReason.trim() }); }}>
                {mutating ? "Authorising…" : "Authorise rollback"}
              </Button>
            </>
          }
        >
          <Field label="Rollback target" hint="A DEPLOYED release of the same product line.">
            <select style={inputStyle} value={rollbackTarget} onChange={(e) => setRollbackTarget(e.target.value)}>
              <option value="">Select target release…</option>
              {rollbackTargets.map((r) => (
                <option key={r.id} value={r.id}>v{r.manifest.version} ({r.id.slice(0, 8)}) DEPLOYED</option>
              ))}
            </select>
          </Field>
          <Field label="Reason">
            <textarea style={{ ...inputStyle, minHeight: 80 }} value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} placeholder="canary failed / customer report" />
          </Field>
          <div style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
            Rollback authorisation requires the OPERATOR role; the release becomes ROLLBACK_AUTHORISED and the target is recorded.
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function advanceBodyText(stageLabel: Record<number, string>, current: number, stages: RolloutPolicyStage[]): string {
  const next = stages.find((s) => s.order === current + 1);
  if (next) {
    return `Move the rollout to stage ${next.order} (${next.kind}, target ${next.targetPercent}% of the eligible fleet, min dwell ${next.minDwellMinutes} min). ` +
      "The action is attributed to your session and appended to the audit chain.";
  }
  return "No further stage remains. Advancing now completes the release train — the release becomes DEPLOYED.";
}
