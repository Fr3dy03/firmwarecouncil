"use client";

/**
 * Command dashboard — the control-room landing page.
 * Every figure is derived client-side from real list endpoints:
 *   /releases, /incidents, /audit?limit=200, /devices
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, useSession } from "../../lib/api";
import {
  Panel, PanelTitle, SectionHeading, Metric, StatusPill, MonoRef,
  IncidentBanner, EmptyState, DataTable, Button,
} from "../../components/fc/ui";

interface ReleaseRow {
  id?: string;
  releaseId?: string;
  status: string;
  createdAt: string;
  organisationId?: string;
  productName?: string;
  manifest?: { version?: string; manifestDigest?: string; artifactDigestSha256?: string };
}
interface IncidentRow {
  id: string; severity: string; status: string; title: string;
  failureReason: string; openedAt: string; releaseId: string;
}
interface AuditEventRow { id: string; sequence: number; timestamp: string; kind: string; entity: string; detail: string; }
interface DeviceRow { id: string; status: string; }

/** Release statuses where MY role still owes an action (mirrors STATE_ACTIONS). */
const AWAITING: Record<string, string[]> = {
  MANUFACTURER: ["CHANGES_REQUESTED"],
  SECURITY_REVIEWER: ["PROPOSED", "CHANGES_REQUESTED"],
  OPERATOR: ["SECURITY_APPROVED", "OPERATOR_APPROVED", "CANARY_RUNNING", "CANARY_PASSED", "PAUSED"],
};

function ts(s?: string): string {
  if (!s) return "—";
  return s.slice(0, 16).replace("T", " ");
}

export default function CommandDashboard() {
  const { user } = useSession();
  const role = user?.role ?? "";
  const organisationId = user?.organisationId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEventRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);

  const rid = (r: ReleaseRow) => r.id ?? r.releaseId;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      api<ReleaseRow[]>("/api/v1/releases"),
      api<IncidentRow[]>("/api/v1/incidents"),
      api<{ intact: boolean; events: AuditEventRow[] }>("/api/v1/audit?limit=200"),
      api<DeviceRow[]>("/api/v1/devices"),
    ])
      .then(([rel, inc, aud, dev]) => {
        if (!alive) return;
        setReleases(rel);
        setIncidents(inc);
        setAuditEvents(aud.events ?? []);
        setDevices(dev);
      })
      .catch((e) => { if (alive) setError(e?.message ?? String(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const awaiting = AWAITING[role] ?? (role === "PLATFORM_ADMIN" ? AWAITING.MANUFACTURER.concat(AWAITING.SECURITY_REVIEWER, AWAITING.OPERATOR) : []);
  const awaitingCount = releases.filter(
    (r) => awaiting.includes(r.status) && (role !== "MANUFACTURER" || r.organisationId === organisationId),
  ).length;

  const openIncidents = incidents.filter((i) => i.status !== "RESOLVED");
  const activeDevices = devices.filter((d) => d.status !== "RETIRED");
  const online = activeDevices.filter((d) => d.status === "ONLINE").length;
  const onlinePct = activeDevices.length ? Math.round((online / activeDevices.length) * 100) : null;

  const today = new Date().toISOString().slice(0, 10);
  const eventsToday = auditEvents.filter((e) => (e.timestamp ?? "").slice(0, 10) === today).length;

  const recent = releases.slice(0, 6);

  return (
    <div>
      <SectionHeading
        eyebrow="Control room"
        title="Command"
        sub={`Multi-party release governance — signed-in as ${user?.name ?? ""} (${role}). All decisions below are signature-bound and audit-chained.`}
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 16, marginBottom: 26 }}>
        <Metric
          label="Awaiting my action"
          value={loading ? "…" : awaitingCount}
          hint={awaiting.length ? `statuses: ${awaiting.join(", ")}` : "no gated actions for this role"}
          tone={awaitingCount > 0 ? "warn" : "ok"}
        />
        <Metric
          label="Open incidents"
          value={loading ? "…" : openIncidents.length}
          hint={`${incidents.filter((i) => i.status === "RESOLVED").length} resolved total`}
          tone={openIncidents.length > 0 ? "bad" : "ok"}
        />
        <Metric
          label="Devices online"
          value={loading ? "…" : onlinePct === null ? "—" : `${onlinePct}%`}
          hint={activeDevices.length ? `${online}/${activeDevices.length} devices` : "no devices registered"}
          tone={onlinePct !== null && onlinePct < 80 ? "warn" : "ok"}
        />
        <Metric
          label="Audit events today"
          value={loading ? "…" : eventsToday}
          hint={`last ${auditEvents.length} events scanned`}
        />
      </div>

      {error ? (
        <Panel style={{ marginBottom: 24, borderLeft: "3px solid var(--fc-red)" }}>
          <PanelTitle>Feed error</PanelTitle>
          <p style={{ fontSize: 13.5, color: "var(--fc-red)" }}>{error}</p>
          <Button variant="ghost" onClick={() => location.reload()}>Retry</Button>
        </Panel>
      ) : null}

      {loading && !error ? (
        <p className="mono" style={{ color: "var(--fc-text-2)", fontSize: 12, marginBottom: 20 }}>▍ syncing control-room feeds…</p>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 22 }}>
        <Panel>
          <PanelTitle right={<Link href="/app/releases" style={{ fontSize: 12 }}>All releases →</Link>}>Release train status</PanelTitle>
          {recent.length === 0 && !loading ? (
            <EmptyState title="No releases yet" body="No firmware releases have been proposed. A manufacturer starts the 10-step release wizard." />
          ) : (
            <DataTable
              columns={[
                { key: "v", label: "Version" },
                { key: "s", label: "Status", width: "170px" },
                { key: "p", label: "Product" },
                { key: "d", label: "Manifest", mono: true, width: "130px" },
                { key: "c", label: "Created", mono: true, width: "130px" },
              ]}
              rows={recent.map((r) => ({
                v: <Link href={`/app/releases/${rid(r)}`} style={{ fontWeight: 600 }}>{r.manifest?.version ?? "—"}</Link>,
                s: <StatusPill status={r.status} small />,
                p: r.productName ?? "—",
                d: <MonoRef value={r.manifest?.manifestDigest} />,
                c: ts(r.createdAt),
              }))}
            />
          )}
        </Panel>

        <Panel>
          <PanelTitle right={<Link href="/app/incidents" style={{ fontSize: 12 }}>All incidents →</Link>}>Open incidents</PanelTitle>
          {openIncidents.length === 0 && !loading ? (
            <EmptyState title="All clear" body="No incidents are OPEN or MITIGATING across the governed fleet." />
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {openIncidents.slice(0, 5).map((i) => (
                <IncidentBanner
                  key={i.id}
                  severity={i.severity}
                  title={i.title}
                  detail={`${i.failureReason} · opened ${ts(i.openedAt)}`}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel style={{ marginTop: 22 }}>
        <PanelTitle right={<Link href="/app/audit" style={{ fontSize: 12 }}>Full audit chain →</Link>}>Recent activity</PanelTitle>
        <DataTable
          columns={[
            { key: "seq", label: "Seq", mono: true, width: "70px" },
            { key: "t", label: "When", mono: true, width: "130px" },
            { key: "k", label: "Kind", width: "220px" },
            { key: "e", label: "Entity", mono: true, width: "180px" },
            { key: "d", label: "Detail" },
          ]}
          rows={auditEvents.slice(0, 8).map((e) => ({
            seq: String(e.sequence),
            t: ts(e.timestamp),
            k: <span style={{ fontWeight: 600 }}>{e.kind}</span>,
            e: e.entity,
            d: e.detail,
          }))}
        />
      </Panel>
    </div>
  );
}
