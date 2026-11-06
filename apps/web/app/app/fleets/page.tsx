"use client";

/**
 * Fleets index — operational view over device fleets.
 * Endpoints: GET /api/v1/fleets (rows carry a devices count), GET
 * /api/v1/devices (per-device status → online/outdated + last activity,
 * grouped client-side), GET /api/v1/product-lines (line name display).
 *
 * NOTE: the API defines NO POST /api/v1/fleets route (routes/index.mts). Fleet
 * creation happens during device provisioning, so instead of a create form we
 * render an honest EmptyState — no invented endpoints.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, useSession } from "../../../lib/api";
import { DataTable, EmptyState, Panel, PanelTitle } from "../../../components/fc/ui";
import type { Device, DeviceFleet, ProductLine } from "../../../../../packages/shared/src/types";

export default function FleetsPage() {
  const { loading, user } = useSession();
  const [fleets, setFleets] = useState<DeviceFleet[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [lines, setLines] = useState<ProductLine[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api<DeviceFleet[]>("/api/v1/fleets"),
      api<Device[]>("/api/v1/devices"),
      api<ProductLine[]>("/api/v1/product-lines"),
    ]).then(([f, d, pl]) => {
      if (!alive) return;
      const errs: string[] = [];
      if (f.status === "fulfilled") setFleets(f.value);
      else if (f.reason instanceof Error) errs.push(f.reason.message);
      if (d.status === "fulfilled") setDevices(d.value);
      if (pl.status === "fulfilled") setLines(pl.value);
      setError(errs.length ? errs.join(" · ") : null);
      setBusy(false);
    });
    return () => { alive = false; };
  }, []);

  const devicesOf = (fleetId: string) => devices.filter((d) => d.fleetId === fleetId);
  const lineName = (plId: string) => lines.find((p) => p.id === plId)?.name ?? "—";

  const rows = fleets.map((f) => {
    const dev = devicesOf(f.id);
    const last = dev.map((d) => d.lastSeenAt ?? "").sort().at(-1) || "";
    return {
      fleet: <Link href={`/app/fleets/${f.id}`} style={{ color: "var(--fc-blue)", fontWeight: 600 }}>{f.name}</Link>,
      line: <span style={{ fontSize: 12.5 }}>{lineName(f.productLineId)}</span>,
      devices: <span className="mono" style={{ fontSize: 12.5 }}>{dev.length}</span>,
      online: <span className="mono" style={{ fontSize: 12.5, color: "var(--fc-green)" }}>{dev.filter((d) => d.status === "ONLINE").length}</span>,
      outdated: <span className="mono" style={{ fontSize: 12.5, color: dev.some((d) => d.status === "OUTDATED") ? "#B4600E" : "var(--fc-text-2)" }}>{dev.filter((d) => d.status === "OUTDATED").length}</span>,
      uptakeFailures: <span className="mono" style={{ fontSize: 12.5, color: dev.some((d) => d.status === "FAILED_UPTAKE") ? "var(--fc-red)" : "var(--fc-text-2)" }}>{dev.filter((d) => d.status === "FAILED_UPTAKE").length}</span>,
      lastActivity: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{last ? new Date(last).toLocaleString() : "never"}</span>,
      created: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{new Date(f.createdAt).toLocaleDateString()}</span>,
    };
  });

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Device operations</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Fleets</h1>
        </div>
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      {!loading && (user?.role === "OPERATOR" || user?.role === "PLATFORM_ADMIN") ? (
        <EmptyState
          title="Fleet creation is handled by device provisioning"
          body={"The API has no fleet-creation endpoint of its own: fleets and their device registrations are provisioned " +
            "from the device agent / provisioning pipeline (POST /api/v1/devices requires an existing fleetId). " +
            "This page is a read-and-observe console over provisioned fleets."}
        />
      ) : null}

      <Panel>
        <PanelTitle right={<span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{fleets.length} fleet(s)</span>}>
          Provisioned fleets
        </PanelTitle>
        {busy ? (
          <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading fleets…</div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="No fleets yet"
            body="Fleets appear here once device provisioning has registered devices against them."
          />
        ) : (
          <DataTable
            minWidth={860}
            columns={[
              { key: "fleet", label: "Fleet" },
              { key: "line", label: "Product line" },
              { key: "devices", label: "Devices", width: "90px" },
              { key: "online", label: "Online", width: "90px" },
              { key: "outdated", label: "Outdated", width: "90px" },
              { key: "uptakeFailures", label: "Uptake fails", width: "100px" },
              { key: "lastActivity", label: "Last activity" },
              { key: "created", label: "Created" },
            ]}
            rows={rows}
          />
        )}
      </Panel>
    </div>
  );
}
