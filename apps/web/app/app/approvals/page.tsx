"use client";

/**
 * Approval queue — SECURITY_REVIEWER sees the security-review queue
 * (PROPOSED / CHANGES_REQUESTED), OPERATOR sees the operator-approval queue
 * (SECURITY_APPROVED). MANUFACTURER sees the pending state of their own
 * submissions instead. PLATFORM_ADMIN sees both queues.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api, useSession } from "../../../lib/api";
import { Panel, PanelTitle, SectionHeading, StatusPill, DataTable, Button, EmptyState } from "../../../components/fc/ui";

interface ReleaseRow {
  id?: string; releaseId?: string; status: string; createdAt: string;
  organisationId?: string; productName?: string; manufacturerOrgName?: string;
  manifest?: { version?: string; manifestDigest?: string };
}

type Tab = "security" | "operator" | "mine";

function ts(s?: string): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

const SECURITY_STATUSES = ["PROPOSED", "CHANGES_REQUESTED"];

export default function ApprovalsPage() {
  const { user } = useSession();
  const role = user?.role ?? "";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [tab, setTab] = useState<Tab>(
    role === "OPERATOR" ? "operator" : role === "SECURITY_REVIEWER" ? "security" : "security",
  );

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

  const rid = (r: ReleaseRow) => r.id ?? r.releaseId ?? "";

  const securityQueue = useMemo(
    () => releases.filter((r) => SECURITY_STATUSES.includes(r.status)),
    [releases],
  );
  const operatorQueue = useMemo(
    () => releases.filter((r) => r.status === "SECURITY_APPROVED"),
    [releases],
  );
  const mineQueue = useMemo(
    () => releases.filter((r) => r.organisationId === user?.organisationId),
    [releases, user],
  );

  const canReviewSecurity = role === "SECURITY_REVIEWER" || role === "PLATFORM_ADMIN";
  const canReviewOperator = role === "OPERATOR" || role === "PLATFORM_ADMIN";
  const manufacturerView = role === "MANUFACTURER";

  const tabs: Array<{ id: Tab; label: string; count: number }> = [];
  if (canReviewSecurity) tabs.push({ id: "security", label: "Security review", count: securityQueue.length });
  if (canReviewOperator) tabs.push({ id: "operator", label: "Operator approval", count: operatorQueue.length });
  if (manufacturerView || role === "PLATFORM_ADMIN") tabs.push({ id: "mine", label: "My organisation", count: mineQueue.length });

  const active = manufacturerView ? "mine" : tab;
  const rows =
    active === "security" ? securityQueue
      : active === "operator" ? operatorQueue
      : mineQueue;

  return (
    <div>
      <SectionHeading
        eyebrow="Decision queue"
        title="Approvals"
        sub={
          manufacturerView
            ? "Pending state of your own submissions. A CHANGES_REQUESTED release must be revised and resubmitted by your org."
            : "Signature-bound decisions. Each verdict requires a sha256 signature digest — derived automatically on the decision page."
        }
      />

      {error ? (
        <Panel style={{ marginBottom: 20, borderLeft: "3px solid var(--fc-red)" }}>
          <PanelTitle>Feed error</PanelTitle>
          <p style={{ fontSize: 13.5, color: "var(--fc-red)" }}>{error}</p>
          <Button variant="ghost" onClick={() => location.reload()}>Retry</Button>
        </Panel>
      ) : null}

      {loading && !error ? <p className="mono" style={{ color: "var(--fc-text-2)", fontSize: 12, marginBottom: 16 }}>▍ loading approval queue…</p> : null}

      {!loading && !error ? (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid var(--fc-border)", paddingBottom: 0 }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  background: "transparent", border: "none", borderBottom: active === t.id ? "3px solid var(--fc-orange)" : "3px solid transparent",
                  padding: "9px 14px 11px", cursor: "pointer", fontSize: 13.5, fontWeight: active === t.id ? 700 : 500,
                  color: active === t.id ? "var(--fc-navy)" : "var(--fc-text-2)",
                }}
              >
                {t.label} ({t.count})
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title={active === "security" ? "Nothing in security review" : active === "operator" ? "No releases awaiting operator approval" : "No releases from your organisation"}
              body={
                active === "security"
                  ? "No releases sit in PROPOSED or CHANGES_REQUESTED right now."
                  : active === "operator"
                    ? "No releases are SECURITY_APPROVED and awaiting your authorisation."
                    : "Submit a release from the manufacturer console to populate this view."
              }
              action={active === "mine" && role === "MANUFACTURER" ? <Button href="/app/releases/new">New release</Button> : undefined}
            />
          ) : active === "mine" ? (
            <Panel>
              <PanelTitle>Submissions</PanelTitle>
              <DataTable
                minWidth={720}
                columns={[
                  { key: "v", label: "Version" },
                  { key: "st", label: "Status", width: "170px" },
                  { key: "p", label: "Product" },
                  { key: "c", label: "Created", mono: true, width: "130px" },
                  { key: "a", label: "Pending state" },
                ]}
                rows={rows.map((r) => ({
                  v: <Link href={`/app/releases/${rid(r)}`} style={{ fontWeight: 600 }}>{r.manifest?.version ?? "—"}</Link>,
                  st: <StatusPill status={r.status} small />,
                  p: r.productName ?? "—",
                  c: ts(r.createdAt),
                  a: r.status === "CHANGES_REQUESTED"
                    ? "Changes requested — revise and resubmit"
                    : ["PROPOSED"].includes(r.status) ? "In security review"
                      : ["OPERATOR_APPROVED", "CANARY_RUNNING", "ROLLOUT_IN_PROGRESS"].includes(r.status) ? "Active rollout"
                        : "—",
                }))}
              />
            </Panel>
          ) : (
            <Panel>
              <PanelTitle>{active === "security" ? "Security review queue" : "Operator approval queue"}</PanelTitle>
              <DataTable
                minWidth={760}
                columns={[
                  { key: "v", label: "Version" },
                  { key: "st", label: "Status", width: "170px" },
                  { key: "p", label: "Product" },
                  { key: "org", label: "Manufacturer" },
                  { key: "ph", label: "Awaiting phase", width: "200px" },
                  { key: "a", label: "Decision" },
                ]}
                rows={rows.map((r) => ({
                  v: <Link href={`/app/approvals/${rid(r)}`} style={{ fontWeight: 600 }}>{r.manifest?.version ?? "—"}</Link>,
                  st: <StatusPill status={r.status} small />,
                  p: r.productName ?? "—",
                  org: r.manufacturerOrgName ?? "—",
                  ph: <span className="mono" style={{ fontSize: 11.5 }}>{active === "security" ? "SECURITY_REVIEW" : "OPERATOR_APPROVAL"}</span>,
                  a: <Link href={`/app/approvals/${rid(r)}`} style={{ fontWeight: 600, fontSize: 12.5 }}>Review →</Link>,
                }))}
              />
            </Panel>
          )}
        </>
      ) : null}
    </div>
  );
}
