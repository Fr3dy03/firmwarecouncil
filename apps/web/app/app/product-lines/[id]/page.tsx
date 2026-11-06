"use client";

/**
 * Product line detail — stats, hardware revisions, releases of this line,
 * recent devices.
 * Endpoints: GET /api/v1/product-lines/:id · GET /api/v1/releases (filtered
 * client-side by productLineId — no server filter on that route) ·
 * GET /api/v1/devices (no productLineId query param exists on the route, so
 * filtering is client-side) · GET /api/v1/fleets (fleet name display).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api } from "../../../../lib/api";
import { DataTable, EmptyState, Metric, Panel, PanelTitle, StatusPill } from "../../../../components/fc/ui";
import type { Device, DeviceFleet, ProductLine } from "../../../../../../packages/shared/src/types";

interface ReleaseRow {
  id: string;
  productLineId: string;
  status: string;
  createdAt: string;
  manifest: { version: string; artifactDigestSha256: string };
  productName?: string;
  manufacturerOrgName?: string;
}

function fmtRel(iso?: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} d ago`;
}

export default function ProductLineDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [line, setLine] = useState<ProductLine | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [fleets, setFleets] = useState<DeviceFleet[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    Promise.allSettled([
      api<ProductLine>(`/api/v1/product-lines/${id}`),
      api<Device[]>("/api/v1/devices"),
      api<DeviceFleet[]>("/api/v1/fleets"),
      api<ReleaseRow[]>("/api/v1/releases"),
    ]).then(([pl, dev, flt, rel]) => {
      if (!alive) return;
      const errs: string[] = [];
      if (pl.status === "fulfilled") setLine(pl.value);
      else if (pl.reason instanceof Error) errs.push(pl.reason.message);
      if (dev.status === "fulfilled") setDevices(dev.value);
      if (flt.status === "fulfilled") setFleets(flt.value);
      if (rel.status === "fulfilled") setReleases(rel.value);
      setError(errs.length ? errs.join(" · ") : null);
      setBusy(false);
    });
    return () => { alive = false; };
  }, [id]);

  if (busy) return <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading product line…</div>;
  if (!line) {
    return (
      <EmptyState
        title="Product line not found"
        body={error ?? "The registry has no product line with this identifier."}
        action={<Link href="/app/product-lines" style={{ fontSize: 13 }}>Back to product lines</Link>}
      />
    );
  }

  const lineDevices = devices.filter((d) => d.productLineId === line.id);
  const lineReleases = releases.filter((r) => r.productLineId === line.id);
  const online = lineDevices.filter((d) => d.status === "ONLINE").length;
  const outdated = lineDevices.filter((d) => d.status === "OUTDATED").length;
  const failed = lineDevices.filter((d) => d.status === "FAILED_UPTAKE").length;
  const fleetFor = (fleetId: string) => fleets.find((f) => f.id === fleetId)?.name ?? "—";
  const revName = (hwId: string) => line.hardwareRevisions?.find((r) => r.id === hwId)?.revision ?? hwId;

  const deviceRows = lineDevices
    .slice()
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""))
    .slice(0, 20)
    .map((d) => ({
      ref: <span className="mono" style={{ fontSize: 12.5, color: "var(--fc-navy)" }}>{d.deviceRef}</span>,
      revision: <span style={{ fontSize: 12.5 }}>{revName(d.hardwareRevisionId)}</span>,
      fleet: <span style={{ fontSize: 12.5 }}>{fleetFor(d.fleetId)}</span>,
      status: <StatusPill status={d.status} small />,
      version: <span className="mono" style={{ fontSize: 12 }}>{d.activeVersion ?? "—"}</span>,
      lastSeen: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{fmtRel(d.lastSeenAt)}</span>,
    }));

  const releaseRows = lineReleases.map((r) => ({
    version: <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fc-navy)" }}>v{r.manifest?.version}</span>,
    digest: <span className="mono" style={{ fontSize: 11 }}>{(r.manifest?.artifactDigestSha256 ?? "").slice(0, 18)}…</span>,
    status: <StatusPill status={r.status} small />,
    created: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{new Date(r.createdAt).toLocaleDateString()}</span>,
    open: <Link href={`/app/releases/${r.id}`} style={{ fontSize: 13 }}>Open release</Link>,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Product line</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>{line.name}</h1>
          <div style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
            {line.productName} · OTA provider {line.otaProviderId || "—"} · compatibility {line.compatibilityPolicy} · registered {new Date(line.createdAt).toLocaleDateString()}
          </div>
        </div>
        <span style={{ flex: 1 }} />
        <StatusPill status={line.active ? "ONLINE" : "RETIRED"} />
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
        <Metric label="Devices" value={lineDevices.length} hint="across all fleets" />
        <Metric label="Online" value={online} tone="ok" />
        <Metric label="Outdated" value={outdated} tone={outdated > 0 ? "warn" : undefined} />
        <Metric label="Uptake failures" value={failed} tone={failed > 0 ? "bad" : undefined} />
        <Metric label="Releases" value={lineReleases.length} hint="proposed for this line" />
      </div>

      <Panel>
        <PanelTitle>Hardware revisions</PanelTitle>
        <DataTable
          minWidth={640}
          columns={[
            { key: "revision", label: "Revision", width: "120px" },
            { key: "architecture", label: "Architecture" },
            { key: "bootloader", label: "Bootloader requirement" },
          ]}
          rows={(line.hardwareRevisions ?? []).map((r) => ({
            revision: <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: "var(--fc-navy)" }}>{r.revision}</span>,
            architecture: <span className="mono" style={{ fontSize: 12 }}>{r.architecture}</span>,
            bootloader: <span style={{ fontSize: 12.5, color: "var(--fc-slate)" }}>{r.bootloaderRequirement || "—"}</span>,
          }))}
        />
        <div style={{ fontSize: 11.5, color: "var(--fc-text-2)", marginTop: 12 }}>
          Supported firmware version families: <span className="mono">{line.supportedFirmwareVersions?.join(", ") || "—"}</span>
        </div>
      </Panel>

      <Panel>
        <PanelTitle right={<span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{lineReleases.length} release(s)</span>}>
          Releases for this line
        </PanelTitle>
        <DataTable
          minWidth={640}
          columns={[
            { key: "version", label: "Version" },
            { key: "digest", label: "Artifact digest" },
            { key: "status", label: "Status" },
            { key: "created", label: "Created" },
            { key: "open", label: "" },
          ]}
          rows={releaseRows}
        />
      </Panel>

      <Panel>
        <PanelTitle right={
          <Link href="/app/fleets" style={{ fontSize: 12.5 }}>All fleets</Link>
        }>
          Devices on this line (most recently seen)
        </PanelTitle>
        <DataTable
          minWidth={720}
          columns={[
            { key: "ref", label: "Device ref", mono: true },
            { key: "revision", label: "HW rev." },
            { key: "fleet", label: "Fleet" },
            { key: "status", label: "Status" },
            { key: "version", label: "Active version" },
            { key: "lastSeen", label: "Last seen" },
          ]}
          rows={deviceRows}
        />
      </Panel>
    </div>
  );
}
