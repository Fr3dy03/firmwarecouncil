"use client";

/**
 * Incident detail — banner header, comment timeline, response controls.
 * Endpoints (exact): GET /api/v1/incidents/:id (record plus `comments`),
 * POST /api/v1/incidents/:id/comments body {body},
 * POST /api/v1/incidents/:id body {status?, correctiveAction?,
 * responsibleEngineerId?} via gov.updateIncident (OPERATOR-gated; the API
 * ignores severity edits, so the UI offers none). GET /api/v1/users for
 * engineer name display.
 */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, ApiError, useSession } from "../../../../lib/api";
import { ApprovalTimeline, Button, ConfirmDialog, Field, IncidentBanner, Panel, PanelTitle, StatusPill, inputStyle } from "../../../../components/fc/ui";
import type { Incident, IncidentComment } from "../../../../../../packages/shared/src/types";

interface UserRow { id: string; name: string; email: string; role: string }
interface IncidentPatch { status?: string; correctiveAction?: string; responsibleEngineerId?: string }

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function IncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { user } = useSession();

  const [incident, setIncident] = useState<(Incident & { comments: IncidentComment[] }) | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mutating, setMutating] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [confirmPatch, setConfirmPatch] = useState<IncidentPatch | null>(null);

  const [commentBody, setCommentBody] = useState("");
  const [status, setStatus] = useState("");
  const [correctiveAction, setCorrectiveAction] = useState("");
  const [responsibleId, setResponsibleId] = useState("");

  useEffect(() => {
    if (!id) return;
    let alive = true;
    api<(Incident & { comments: IncidentComment[] })>(`/api/v1/incidents/${id}`)
      .then((inc) => {
        if (!alive) return;
        setIncident(inc);
        setStatus(inc.status);
        setResponsibleId(inc.responsibleEngineerId ?? "");
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
      })
      .finally(() => { if (alive) setBusy(false); });
    api<UserRow[]>("/api/v1/users").then((u) => { if (alive) setUsers(u); }).catch(() => undefined);
    return () => { alive = false; };
  }, [id]);

  if (busy) return <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading incident…</div>;
  if (!incident) {
    return (
      <div>
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error ?? "Incident not found."}
        </div>
        <p style={{ marginTop: 10 }}><Link href="/app/incidents" style={{ fontSize: 13 }}>Back to incidents</Link></p>
      </div>
    );
  }

  const userLabel = (uid?: string | null) => {
    if (!uid) return "—";
    const u = users.find((x) => x.id === uid);
    return u ? u.name : `${uid.slice(0, 10)}…`;
  };
  const canUpdate = user?.role === "OPERATOR" || user?.role === "PLATFORM_ADMIN";

  async function postJson(url: string, body: unknown): Promise<boolean> {
    setMutating(true);
    setMutationError(null);
    try {
      await api(url, { method: "POST", body });
      const inc = await api<Incident & { comments: IncidentComment[] }>(`/api/v1/incidents/${id}`);
      setIncident(inc);
      setStatus(inc.status);
      setResponsibleId(inc.responsibleEngineerId ?? "");
      return true;
    } catch (e: unknown) {
      setMutationError(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
      return false;
    } finally {
      setMutating(false);
    }
  }

  const patch: IncidentPatch = {};
  if (status !== incident.status) patch.status = status;
  if (correctiveAction.trim()) patch.correctiveAction = correctiveAction.trim();
  if (responsibleId && responsibleId !== (incident.responsibleEngineerId ?? "")) patch.responsibleEngineerId = responsibleId;
  const hasChanges = Object.keys(patch).length > 0;

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 980, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Incident</div>
          <h1 style={{ fontSize: 22, color: "var(--fc-navy)" }}>{incident.title}</h1>
          <div className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{incident.id}</div>
        </div>
        <span style={{ flex: 1 }} />
        <StatusPill status={incident.status} />
      </div>

      <IncidentBanner severity={incident.severity} title={incident.title} detail={incident.failureReason} />

      <Panel>
        <PanelTitle>Facts</PanelTitle>
        <div style={{ display: "grid", gridTemplateColumns: "170px 1fr", rowGap: 8, columnGap: 16, fontSize: 13 }}>
          <div style={{ color: "var(--fc-text-2)" }}>Severity</div><div><StatusPill status={incident.severity} small /></div>
          <div style={{ color: "var(--fc-text-2)" }}>Status</div><div><StatusPill status={incident.status} small /></div>
          <div style={{ color: "var(--fc-text-2)" }}>Opened</div><div>{fmt(incident.openedAt)}</div>
          <div style={{ color: "var(--fc-text-2)" }}>Resolved</div><div>{incident.resolvedAt ? fmt(incident.resolvedAt) : "—"}</div>
          <div style={{ color: "var(--fc-text-2)" }}>Responsible</div><div>{userLabel(incident.responsibleEngineerId)}</div>
          <div style={{ color: "var(--fc-text-2)" }}>Release</div>
          <div><Link href={`/app/releases/${incident.releaseId}`}>Open release record</Link></div>
          <div style={{ color: "var(--fc-text-2)" }}>Corrective action</div><div>{incident.correctiveAction || "not recorded yet"}</div>
          <div style={{ color: "var(--fc-text-2)" }}>Evidence</div><div>{(incident.evidenceLinks ?? []).length ? (incident.evidenceLinks ?? []).join(", ") : "—"}</div>
        </div>
      </Panel>

      {mutationError ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {mutationError}
        </div>
      ) : null}

      {canUpdate ? (
        <Panel>
          <PanelTitle>Response controls</PanelTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Field label="Status" hint="RESOLVED stamps the resolved timestamp server-side.">
              <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
                {["OPEN", "MITIGATING", "RESOLVED"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Responsible engineer">
              <select style={inputStyle} value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
                <option value="">— unassigned —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
              </select>
            </Field>
          </div>
          <Field label="Corrective action" hint="Recorded as evidence on the incident and audit chain.">
            <textarea style={{ ...inputStyle, minHeight: 80 }} value={correctiveAction} onChange={(e) => setCorrectiveAction(e.target.value)} placeholder="What was changed to close the loop" />
          </Field>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <Button
              disabled={mutating || !hasChanges}
              onClick={() => setConfirmPatch(patch)}
            >
              Save changes
            </Button>
            <div style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
              Note: the API does not accept severity edits after opening — re-open a corrected incident instead.
            </div>
          </div>

          {confirmPatch ? (
            <ConfirmDialog
              title="Update incident"
              body={patchSummary(confirmPatch, userLabel)}
              confirmLabel={mutating ? "Saving…" : "Save changes"}
              onConfirm={() => {
                const p = confirmPatch;
                void postJson(`/api/v1/incidents/${id}`, p).then((ok) => {
                  if (ok) { setCorrectiveAction(""); }
                });
              }}
              onClose={() => setConfirmPatch(null)}
            />
          ) : null}
        </Panel>
      ) : null}

      <Panel>
        <PanelTitle right={<span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{incident.comments?.length ?? 0}</span>}>
          Comments — timeline
        </PanelTitle>
        {(incident.comments ?? []).length === 0 ? (
          <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>No comments recorded yet.</div>
        ) : (
          <ApprovalTimeline
            events={(incident.comments ?? []).map((c) => ({
              title: userLabel(c.authorUserId),
              when: c.createdAt,
              body: <span style={{ whiteSpace: "pre-wrap" }}>{c.body}</span>,
            }))}
          />
        )}
        <div style={{ borderTop: "1px solid var(--fc-border)", marginTop: 16, paddingTop: 14 }}>
          <Field label="Add comment">
            <textarea style={{ ...inputStyle, minHeight: 70 }} value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Corroborating device reports, mitigation notes…" />
          </Field>
          <Button
            variant="secondary"
            disabled={mutating || !commentBody.trim()}
            onClick={() => {
              const text = commentBody.trim();
              void postJson(`/api/v1/incidents/${id}/comments`, { body: text }).then((ok) => { if (ok) setCommentBody(""); });
            }}
          >
            {mutating ? "Posting…" : "Post comment"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function patchSummary(p: IncidentPatch, userLabel: (uid?: string | null) => string): ReactNode {
  const parts: string[] = [];
  if (p.status) parts.push(`status → ${p.status}`);
  if (p.correctiveAction) parts.push(`record corrective action ("${p.correctiveAction.slice(0, 80)}")`);
  if (p.responsibleEngineerId) parts.push(`assign responsible engineer ${userLabel(p.responsibleEngineerId)}`);
  return `Apply ${parts.length} change(s): ${parts.join("; ")}. The update is attributed to your session on the audit chain.`;
}
