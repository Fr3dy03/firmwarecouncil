"use client";

/**
 * Incident list with severity/status filters and the "Open incident" modal.
 * Endpoints: GET /api/v1/incidents (optional ?status=&releaseId= — filtered
 * client-side here so severity can be filtered too), GET /api/v1/releases +
 * /api/v1/users for the modal selects, POST /api/v1/incidents body
 * {releaseId, title, failureReason, severity?} — gov.openIncident is gated to
 * the OPERATOR role (PLATFORM_ADMIN passes via the requireOrg override), so
 * the UI only offers the modal to OPERATOR/PLATFORM_ADMIN.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useSession } from "../../../lib/api";
import { Button, ConfirmDialog, DataTable, EmptyState, Field, Modal, Panel, PanelTitle, StatusPill, inputStyle } from "../../../components/fc/ui";

interface Incident {
  id: string;
  releaseId: string;
  severity: string;
  status: string;
  title: string;
  failureReason: string;
  responsibleEngineerId?: string | null;
  openedAt: string;
  resolvedAt?: string | null;
}

interface ReleaseRow {
  id: string;
  status: string;
  manifest: { version: string };
  productName: string;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

const SEVERITIES = ["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const STATUSES = ["ALL", "OPEN", "MITIGATING", "RESOLVED"] as const;

export default function IncidentsPage() {
  const { loading, user } = useSession();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sevFilter, setSevFilter] = useState<(typeof SEVERITIES)[number]>("ALL");
  const [statusFilter, setStatusFilter] = useState<(typeof STATUSES)[number]>("ALL");

  const [openModal, setOpenModal] = useState(false);
  const [form, setForm] = useState({ releaseId: "", severity: "MEDIUM", title: "", failureReason: "" });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBody, setConfirmBody] = useState("");
  const [mutating, setMutating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api<Incident[]>("/api/v1/incidents"),
      api<ReleaseRow[]>("/api/v1/releases"),
      api<UserRow[]>("/api/v1/users"),
    ]).then(([inc, rel, usr]) => {
      if (!alive) return;
      const errs: string[] = [];
      if (inc.status === "fulfilled") setIncidents(inc.value);
      else if (inc.reason instanceof Error) errs.push(inc.reason.message);
      if (rel.status === "fulfilled") setReleases(rel.value);
      if (usr.status === "fulfilled") setUsers(usr.value);
      setError(errs.length ? errs.join(" · ") : null);
      setBusy(false);
    });
    return () => { alive = false; };
  }, []);

  const shown = incidents
    .filter((i) => (sevFilter === "ALL" ? true : i.severity === sevFilter))
    .filter((i) => (statusFilter === "ALL" ? true : i.status === statusFilter));

  const releaseLabel = (rid: string) => {
    const r = releases.find((x) => x.id === rid);
    return r ? `v${r.manifest?.version} · ${r.productName}` : rid;
  };
  const userLabel = (uid?: string | null) => {
    if (!uid) return "—";
    const u = users.find((x) => x.id === uid);
    return u ? u.name : `${uid.slice(0, 10)}…`;
  };

  const canOpenIncident = !loading && (user?.role === "OPERATOR" || user?.role === "PLATFORM_ADMIN");

  async function submitIncident() {
    setMutating(true);
    setFormError(null);
    try {
      await api("/api/v1/incidents", {
        method: "POST",
        body: {
          releaseId: form.releaseId,
          title: form.title.trim(),
          failureReason: form.failureReason.trim(),
          severity: form.severity,
        },
      });
      const fresh = await api<Incident[]>("/api/v1/incidents");
      setIncidents(fresh);
      setOpenModal(false);
      setConfirmOpen(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e));
      setConfirmOpen(false);
    } finally {
      setMutating(false);
    }
  }

  const rows = shown.map((i) => ({
    id: <span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{i.id.slice(0, 12)}…</span>,
    severity: <StatusPill status={i.severity} small />,
    status: <StatusPill status={i.status} small />,
    title: <Link href={`/app/incidents/${i.id}`} style={{ fontWeight: 600 }}>{i.title}</Link>,
    release: <Link href={`/app/releases/${i.releaseId}`} style={{ fontSize: 12.5 }}>{releaseLabel(i.releaseId)}</Link>,
    opened: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{new Date(i.openedAt).toLocaleString()}</span>,
    responsible: <span style={{ fontSize: 12.5 }}>{userLabel(i.responsibleEngineerId)}</span>,
    open: <Link href={`/app/incidents/${i.id}`} style={{ fontSize: 13 }}>Detail</Link>,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Response management</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Incidents</h1>
          <div style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
            Field incidents tied to releases; opening an incident with pause defaults to halting the affected rollout.
          </div>
        </div>
        <span style={{ flex: 1 }} />
        {canOpenIncident ? <Button onClick={() => { setForm({ releaseId: releases[0]?.id ?? "", severity: "MEDIUM", title: "", failureReason: "" }); setFormError(null); setOpenModal(true); }}>Open incident</Button> : null}
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <Panel>
        <PanelTitle
          right={
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {SEVERITIES.map((s) => (
                  <button key={s} onClick={() => setSevFilter(s)} style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", cursor: "pointer", padding: "3px 8px", borderRadius: 3,
                    border: `1px solid ${sevFilter === s ? "var(--fc-blue)" : "var(--fc-border)"}`,
                    background: sevFilter === s ? "var(--fc-pale-blue)" : "transparent",
                    color: sevFilter === s ? "var(--fc-blue)" : "var(--fc-text-2)",
                  }}>{s}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => setStatusFilter(s)} style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", cursor: "pointer", padding: "3px 8px", borderRadius: 3,
                    border: `1px solid ${statusFilter === s ? "var(--fc-orange)" : "var(--fc-border)"}`,
                    background: statusFilter === s ? "var(--fc-pale-orange)" : "transparent",
                    color: statusFilter === s ? "#B4600E" : "var(--fc-text-2)",
                  }}>{s === "ALL" ? "ANY" : s}</button>
                ))}
              </div>
            </div>
          }
        >
          Incident register ({shown.length} of {incidents.length})
        </PanelTitle>
        {busy ? <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading incidents…</div> : (
          <DataTable
            minWidth={900}
            columns={[
              { key: "id", label: "ID" },
              { key: "severity", label: "Severity", width: "120px" },
              { key: "status", label: "Status", width: "120px" },
              { key: "title", label: "Title" },
              { key: "release", label: "Release" },
              { key: "opened", label: "Opened" },
              { key: "responsible", label: "Responsible" },
              { key: "open", label: "" },
            ]}
            rows={rows}
          />
        )}
        {!busy && incidents.length === 0 ? (
          <EmptyState
            title="No incidents on record"
            body="Incidents appear here when devices report uptake failures from a canary, or when a reviewer/operator opens one against a release."
          />
        ) : null}
      </Panel>

      {openModal ? (
        <Modal
          title="Open incident"
          onClose={() => setOpenModal(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpenModal(false)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={mutating || !form.releaseId || !form.title.trim() || !form.failureReason.trim()}
                onClick={() => {
                  const rel = releases.find((r) => r.id === form.releaseId);
                  setConfirmBody(
                    (rel ? `Open a ${form.severity} incident against v${rel.manifest?.version} (${rel.productName}). ` : "") +
                    "The service pauses a running canary/rollout for the affected release unless it is already terminal. Confirm assignment as your session's responsibility.",
                  );
                  setConfirmOpen(true);
                }}
              >
                Review
              </Button>
            </>
          }
        >
          <Field label="Release">
            <select style={inputStyle} value={form.releaseId} onChange={(e) => setForm((f) => ({ ...f, releaseId: e.target.value }))}>
              <option value="">Select release…</option>
              {releases.map((r) => (
                <option key={r.id} value={r.id}>v{r.manifest?.version} · {r.productName} ({r.status})</option>
              ))}
            </select>
          </Field>
          <Field label="Severity">
            <select style={inputStyle} value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}>
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Title">
            <input style={inputStyle} value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Short, factual summary" />
          </Field>
          <Field label="Failure reason" hint="Observed device behaviour, scope, first report.">
            <textarea style={{ ...inputStyle, minHeight: 90 }} value={form.failureReason} onChange={(e) => setForm((f) => ({ ...f, failureReason: e.target.value }))} />
          </Field>
          <div style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
            The governance service allows incident opening to the OPERATOR role (plus platform admin); other roles cannot record incidents through the API.
          </div>
          {formError ? (
            <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "8px 12px", fontSize: 12.5, marginTop: 10 }}>
              {formError}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {confirmOpen ? (
        <ConfirmDialog
          title="Open incident"
          body={confirmBody}
          confirmLabel={mutating ? "Opening…" : "Open incident"}
          tone="danger"
          onConfirm={() => { void submitIncident(); }}
          onClose={() => setConfirmOpen(false)}
        />
      ) : null}
    </div>
  );
}
