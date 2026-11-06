"use client";

/**
 * Release register — filterable list across governance statuses with
 * role-specific action highlighting. Rows link into the release control room.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useSession } from "../../../lib/api";
import {
  Panel, PanelTitle, SectionHeading, StatusPill, DataTable, Button, EmptyState, inputStyle,
} from "../../../components/fc/ui";

interface ReleaseRow {
  id?: string;
  releaseId?: string;
  status: string;
  createdAt: string;
  organisationId?: string;
  productName?: string;
  manufacturerOrgName?: string;
  manifest?: { version?: string; manifestDigest?: string };
}

function ts(s?: string): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

/** Which step of the release train this status sits at (display hint only). */
function trainHint(status: string): string {
  switch (status) {
    case "PROPOSED": return "1 · security review";
    case "CHANGES_REQUESTED": return "0 · revisions requested";
    case "SECURITY_APPROVED": return "2 · operator approval";
    case "OPERATOR_APPROVED": return "3 · canary gate";
    case "CANARY_RUNNING": return "3 · canary running";
    case "CANARY_PASSED": return "4 · authorise rollout";
    case "ROLLOUT_IN_PROGRESS": return "4 · staged rollout";
    case "PAUSED": return "4 · paused";
    case "DEPLOYED": return "6 · deployed";
    case "REJECTED": return "terminal · rejected";
    case "REVOKED": return "terminal · revoked";
    case "SUPERSEDED": return "terminal · superseded";
    case "ROLLBACK_AUTHORISED": return "terminal · rollback";
    default: return "—";
  }
}

/** Per-role highlight badge in the version cell. */
function highlightFor(role: string, orgId: string, r: ReleaseRow) {
  if (role === "SECURITY_REVIEWER" && r.status === "PROPOSED") {
    return { text: "ACTION · REVIEW", bg: "var(--fc-pale-blue)" };
  }
  if (role === "OPERATOR" && r.status === "SECURITY_APPROVED") {
    return { text: "ACTION · APPROVAL", bg: "var(--fc-pale-orange)" };
  }
  if (role === "MANUFACTURER" && r.status === "CHANGES_REQUESTED" && r.organisationId === orgId) {
    return { text: "ACTION · REVISE", bg: "var(--fc-pale-orange)" };
  }
  return null;
}

export default function ReleasesPage() {
  const { user } = useSession();
  const role = user?.role ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    api<ReleaseRow[]>("/api/v1/releases")
      .then((rs) => alive && setReleases(rs))
      .catch((e) => alive && setError(e?.message ?? String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const statuses = Array.from(new Set(releases.map((r) => r.status))).sort();
  const visible = filter === "ALL" ? releases : releases.filter((r) => r.status === filter);
  const rid = (r: ReleaseRow) => r.id ?? r.releaseId ?? "";

  return (
    <div>
      <SectionHeading
        eyebrow="Firmware register"
        title="Releases"
        sub="Every release proposal carries a canonical manifest digest, a signing-chain and a staged rollout policy."
      />

      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ ...inputStyle, width: "260px" }}>
          <option value="ALL">All statuses ({releases.length})</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, " ")} ({releases.filter((r) => r.status === s).length})</option>
          ))}
        </select>
        <span style={{ flex: 1 }} />
        {role === "MANUFACTURER" ? (
          <Button href="/app/releases/new">New release</Button>
        ) : null}
      </div>

      {error ? (
        <Panel style={{ marginBottom: 22, borderLeft: "3px solid var(--fc-red)" }}>
          <PanelTitle>Feed error</PanelTitle>
          <p style={{ fontSize: 13.5, color: "var(--fc-red)" }}>{error}</p>
          <Button variant="ghost" onClick={() => location.reload()}>Retry</Button>
        </Panel>
      ) : null}

      {loading && !error ? (
        <p className="mono" style={{ color: "var(--fc-text-2)", fontSize: 12 }}>▍ loading release register…</p>
      ) : null}

      {!loading && !error ? (
        visible.length === 0 ? (
          <EmptyState
            title="No releases match"
            body={filter === "ALL" ? "No firmware releases registered yet." : `No releases currently sit in status ${filter}.`}
            action={role === "MANUFACTURER" && filter === "ALL" ? <Button href="/app/releases/new">Start the release wizard</Button> : undefined}
          />
        ) : (
          <Panel pad={0} style={{ overflow: "hidden" }}>
            <DataTable
              minWidth={860}
              columns={[
                { key: "v", label: "Version" },
                { key: "st", label: "Status", width: "160px" },
                { key: "p", label: "Product" },
                { key: "org", label: "Manufacturer" },
                { key: "c", label: "Created", mono: true, width: "130px" },
                { key: "h", label: "Train position", width: "180px" },
                { key: "d", label: "" },
              ]}
              rows={visible.map((r) => {
                const hl = highlightFor(role, user?.organisationId ?? "", r);
                return {
                  v: (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <Link href={`/app/releases/${rid(r)}`} style={{ fontWeight: 600 }}>{r.manifest?.version ?? "—"}</Link>
                      {hl ? (
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", background: hl.bg, color: "var(--fc-navy)", padding: "2px 6px", borderRadius: 3 }}>
                          {hl.text}
                        </span>
                      ) : null}
                    </span>
                  ),
                  st: <StatusPill status={r.status} small />,
                  p: r.productName ?? "—",
                  org: r.manufacturerOrgName ?? "—",
                  c: ts(r.createdAt),
                  h: <span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{trainHint(r.status)}</span>,
                  d: <Link href={`/app/releases/${rid(r)}`} style={{ fontSize: 12.5 }}>Control room →</Link>,
                };
              })}
            />
          </Panel>
        )
      ) : null}
    </div>
  );
}
