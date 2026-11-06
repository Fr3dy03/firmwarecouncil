"use client";

/**
 * Fleet detail — device roster with status filter chips and inline receipts.
 * Endpoints: GET /api/v1/fleets/:id (→ {...fleet, devices: Device[]}),
 * GET /api/v1/product-lines (hardware revision labels), GET
 * /api/v1/devices/:id/receipts (expanded per-device, on demand).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { DataTable, EmptyState, Panel, PanelTitle, StatusPill } from "../../../../components/fc/ui";
import type { Device, DeviceFleet, InstallationReceipt, ProductLine } from "../../../../../../packages/shared/src/types";

function fmtRel(iso?: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.floor(h / 24)} d ago`;
}

const STATUS_FILTERS = ["ALL", "ONLINE", "OFFLINE", "OUTDATED", "FAILED_UPTAKE", "RETIRED"] as const;

export default function FleetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [fleet, setFleet] = useState<(DeviceFleet & { devices?: Device[] }) | null>(null);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, InstallationReceipt[]>>({});
  const [receiptsError, setReceiptsError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.allSettled([
      api<DeviceFleet & { devices: Device[] }>(`/api/v1/fleets/${id}`),
      api<ProductLine[]>("/api/v1/product-lines"),
    ]).then(([f, pl]) => {
      if (!alive) return;
      if (f.status === "fulfilled") setFleet(f.value);
      else if (f.reason instanceof Error) setError(f.reason.message);
      if (pl.status === "fulfilled") setLines(pl.value);
      setBusy(false);
    });
    return () => { alive = false; };
  }, [id]);

  if (busy) return <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading fleet…</div>;
  if (!fleet) {
    return (
      <EmptyState
        title="Fleet not found"
        body={error ?? "No fleet with this identifier."}
        action={<Link href="/app/fleets" style={{ fontSize: 13 }}>Back to fleets</Link>}
      />
    );
  }

  const line = lines.find((p) => p.id === fleet.productLineId);
  const revName = (hwId: string) => line?.hardwareRevisions?.find((r) => r.id === hwId)?.revision ?? hwId;
  const allDevices = fleet.devices ?? [];
  const counts: Record<string, number> = { ALL: allDevices.length };
  for (const d of allDevices) counts[d.status] = (counts[d.status] ?? 0) + 1;
  const shown = statusFilter === "ALL" ? allDevices : allDevices.filter((d) => d.status === statusFilter);

  async function toggleReceipts(deviceId: string) {
    if (expandedId === deviceId) { setExpandedId(null); return; }
    setExpandedId(deviceId);
    setReceiptsError(null);
    if (receipts[deviceId]) return;
    try {
      const r = await api<InstallationReceipt[]>(`/api/v1/devices/${deviceId}/receipts`);
      setReceipts((m) => ({ ...m, [deviceId]: r }));
    } catch (e: unknown) {
      setReceiptsError(e instanceof Error ? e.message : String(e));
      setExpandedId(null);
    }
  }

  const rows: Record<string, React.ReactNode>[] = [];
  for (const d of shown) {
    rows.push({
      ref: <span className="mono" style={{ fontSize: 12.5, color: "var(--fc-navy)" }}>{d.deviceRef}</span>,
      revision: <span style={{ fontSize: 12.5 }}>{revName(d.hardwareRevisionId)}</span>,
      status: <StatusPill status={d.status} small />,
      activeVersion: <span className="mono" style={{ fontSize: 12 }}>{d.activeVersion ?? "—"}</span>,
      lastSeen: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{fmtRel(d.lastSeenAt)}</span>,
      receipts: (
        <ReceiptsToggle expanded={expandedId === d.id} onToggle={() => { void toggleReceipts(d.id); }} count={receipts[d.id]?.length} />
      ),
    });
    if (expandedId === d.id) {
      const list = receipts[d.id] ?? [];
      rows.push({
        ref: "",
        revision: "",
        status: "",
        activeVersion: "",
        lastSeen: "",
        receipts: (
          <div style={{ background: "var(--fc-pale-blue)", border: "1px solid var(--fc-border)", borderRadius: 4, padding: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--fc-text-2)", marginBottom: 8 }}>
              Installation receipts — {d.deviceRef}
            </div>
            {list.length === 0 ? (
              <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>No receipts recorded for this device.</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {list.map((r) => (
                  <div key={r.id} style={{ display: "flex", gap: 12, fontSize: 12, alignItems: "center", flexWrap: "wrap" }}>
                    <StatusPill status={r.outcome} small />
                    <span className="mono" style={{ fontSize: 11.5 }}>v{r.version}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--fc-slate)" }}>{(r.artifactDigestSha256 ?? "").slice(0, 16)}…</span>
                    <span style={{ color: "var(--fc-text-2)" }}>{new Date(r.receivedAt).toLocaleString()}</span>
                    {r.failureReason ? <span style={{ color: "var(--fc-red)" }}>{r.failureReason}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        ),
      });
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Fleet</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>{fleet.name}</h1>
          <div style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
            Product line {line?.name ?? fleet.productLineId} · provisioned {new Date(fleet.createdAt).toLocaleDateString()}
          </div>
        </div>
        <span style={{ flex: 1 }} />
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <Panel>
        <PanelTitle
          right={
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  disabled={s !== "ALL" && !counts[s]}
                  style={{
                    fontSize: 11.5, fontWeight: 600, letterSpacing: "0.04em", cursor: "pointer",
                    padding: "4px 10px", borderRadius: 3,
                    border: `1px solid ${statusFilter === s ? "var(--fc-blue)" : "var(--fc-border)"}`,
                    background: statusFilter === s ? "var(--fc-pale-blue)" : "transparent",
                    color: statusFilter === s ? "var(--fc-blue)" : "var(--fc-text-2)",
                    opacity: s !== "ALL" && !counts[s] ? 0.45 : 1,
                  }}
                >
                  {s === "ALL" ? "ALL" : s}{counts[s] ? ` (${counts[s]})` : ""}
                </button>
              ))}
            </div>
          }
        >
          Devices ({shown.length})
        </PanelTitle>
        {receiptsError ? (
          <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "8px 12px", fontSize: 12.5, marginBottom: 10 }}>
            {receiptsError}
          </div>
        ) : null}
        {shown.length === 0 ? (
          <EmptyState title="No devices match" body="Provisioned devices show here. Adjust the status filter or check the product line registry." />
        ) : (
          <DataTable
            minWidth={720}
            columns={[
              { key: "ref", label: "Device ref", mono: true },
              { key: "revision", label: "HW rev.", width: "100px" },
              { key: "status", label: "Status", width: "130px" },
              { key: "activeVersion", label: "Active version" },
              { key: "lastSeen", label: "Last seen" },
              { key: "receipts", label: "Receipts", width: "130px" },
            ]}
            rows={rows}
          />
        )}
      </Panel>
    </div>
  );
}

/** Compact expand-toggle rendered inside a table cell. */
function ReceiptsToggle({ expanded, onToggle, count }: { expanded: boolean; onToggle: () => void; count?: number }) {
  return (
    <button
      onClick={onToggle}
      style={{
        background: "transparent", border: `1px solid ${expanded ? "var(--fc-blue)" : "var(--fc-border)"}`,
        color: expanded ? "var(--fc-blue)" : "var(--fc-slate)", cursor: "pointer",
        fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 3,
      }}
    >
      {expanded ? "Hide receipts" : `Receipts${count ? ` (${count})` : ""}`}
    </button>
  );
}
