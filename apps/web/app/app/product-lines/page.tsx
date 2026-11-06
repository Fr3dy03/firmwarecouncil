"use client";

/**
 * Product lines index — catalogue of governed hardware lines.
 * Endpoint: GET /api/v1/product-lines (own-org rows; PLATFORM_ADMIN/OPERATOR/
 * SECURITY_REVIEWER see all), GET /api/v1/devices (client-side grouping for
 * device counts — the devices route only supports ?fleetId=, not productLineId).
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useSession } from "../../../lib/api";
import { Button, DataTable, EmptyState, Panel, PanelTitle, StatusPill } from "../../../components/fc/ui";
import type { Device, ProductLine } from "../../../../../packages/shared/src/types";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function ProductLinesPage() {
  const { loading, user } = useSession();
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api<ProductLine[]>("/api/v1/product-lines"),
      api<Device[]>("/api/v1/devices"),
    ]).then(([l, d]) => {
      if (!alive) return;
      const errs: string[] = [];
      if (l.status === "fulfilled") setLines(l.value);
      else if (l.reason instanceof Error) errs.push(l.reason.message);
      if (d.status === "fulfilled") setDevices(d.value);
      else if (d.reason instanceof Error) errs.push(d.reason.message);
      setError(errs.length ? errs.join(" · ") : null);
      setBusy(false);
    });
    return () => { alive = false; };
  }, []);

  const canCreate = user?.role === "MANUFACTURER" || user?.role === "PLATFORM_ADMIN";
  const deviceCount = (pl: ProductLine) => devices.filter((d) => d.productLineId === pl.id).length;

  const rows = lines.map((pl) => ({
    product: <span style={{ fontWeight: 600, color: "var(--fc-navy)" }}>{pl.productName}</span>,
    name: <Link href={`/app/product-lines/${pl.id}`} style={{ color: "var(--fc-blue)" }}>{pl.name}</Link>,
    architecture: <span className="mono" style={{ fontSize: 12 }}>{pl.defaultArchitecture}</span>,
    bootloader: <span style={{ fontSize: 12.5, color: "var(--fc-slate)" }}>{pl.bootloaderRequirements || "—"}</span>,
    devices: <span className="mono" style={{ fontSize: 12 }}>{deviceCount(pl)}</span>,
    ota: <span className="mono" style={{ fontSize: 12 }}>{pl.otaProviderId || "—"}</span>,
    revisions: <span className="mono" style={{ fontSize: 11.5 }}>{(pl.hardwareRevisions ?? []).map((r) => r.revision).join(", ") || "—"}</span>,
    active: <StatusPill status={pl.active ? "ONLINE" : "RETIRED"} small />,
    created: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{fmtDate(pl.createdAt)}</span>,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Hardware governance</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Product lines</h1>
        </div>
        <span style={{ flex: 1 }} />
        {canCreate && !loading ? <Button href="/app/product-lines/new">New product line</Button> : null}
      </div>

      {!canCreate && !loading && user ? (
        <EmptyState
          title="Product line registration is manufacturer-gated"
          body={`Product lines are registered by MANUFACTURER organisations with role-gated API access (` +
            `your ${user.role} session is read-only for this registry). Existing lines are listed below.`}
        />
      ) : null}

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <Panel>
        <PanelTitle right={<span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{lines.length} line(s)</span>}>
          Registered lines
        </PanelTitle>
        {busy ? (
          <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading registry…</div>
        ) : lines.length === 0 ? (
          <EmptyState
            title="No product lines yet"
            body={canCreate
              ? "Register your first product line to attach hardware revisions, the bootloader requirement and an OTA provider. Releases are then proposed against this line."
              : "No product lines are visible to this account yet. They appear here as soon as a manufacturer registers one."}
            action={canCreate ? <Button href="/app/product-lines/new">New product line</Button> : undefined}
          />
        ) : (
          <DataTable
            columns={[
              { key: "product", label: "Product" },
              { key: "name", label: "Name" },
              { key: "revisions", label: "Revisions" },
              { key: "architecture", label: "Architecture" },
              { key: "bootloader", label: "Bootloader req." },
              { key: "devices", label: "Devices", width: "90px" },
              { key: "ota", label: "OTA provider" },
              { key: "active", label: "Active" },
              { key: "created", label: "Created", width: "120px" },
            ]}
            rows={rows}
            minWidth={980}
          />
        )}
      </Panel>
    </div>
  );
}
