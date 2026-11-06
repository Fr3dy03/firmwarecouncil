"use client";

/**
 * Audit chain — hash-chained, append-only trail.
 * Endpoint: GET /api/v1/audit?limit=200 → { intact: boolean, events: AuditEvent[] }
 * (server or desc; sorts internally ascending for chain checks).
 * The integrity panel recomputes the prevHash→hash linkage client-side and
 * reports first/last hashes plus a green/red verdict.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { DataTable, Panel, PanelTitle } from "../../../components/fc/ui";
import type { AuditEvent } from "../../../../../packages/shared/src/types";

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export default function AuditPage() {
  const [loaded, setLoaded] = useState<AuditEvent[]>([]);
  const [intact, setIntact] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [kindFilter, setKindFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  const [orgNames, setOrgNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    api<{ intact: boolean; events: AuditEvent[] }>("/api/v1/audit?limit=200")
      .then((r) => {
        if (!alive) return;
        setLoaded(r.events);
        setIntact(r.intact);
      })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setBusy(false); });
    api<Array<{ id: string; name: string }>>("/api/v1/organisations")
      .then((orgs) => {
        if (!alive) return;
        const m: Record<string, string> = {};
        for (const o of orgs) m[o.id] = o.name;
        setOrgNames(m);
      })
      .catch(() => undefined); // names stay as raw ids when not resolvable
    return () => { alive = false; };
  }, []);

  // ascending by sequence, chain linkage recomputed client-side
  const chain = useMemo(() => loaded.slice().sort((a, b) => a.sequence - b.sequence), [loaded]);
  const breakAt = useMemo(() => {
    for (let i = 1; i < chain.length; i++) {
      if (chain[i].prevHash !== chain[i - 1].hash) return chain[i].sequence;
    }
    return null;
  }, [chain]);
  const firstHash = chain[0]?.hash ?? null;
  const lastHash = chain[chain.length - 1]?.hash ?? null;

  const shown = chain
    .filter((e) => (kindFilter.trim() ? e.kind.toLowerCase().includes(kindFilter.trim().toLowerCase()) : true))
    .filter((e) => (entityFilter.trim() ? (e.entity ?? "").toLowerCase().includes(entityFilter.trim().toLowerCase()) : true))
    .slice()
    .reverse();

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Tamper evidence</div>
        <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Audit chain</h1>
        <div style={{ fontSize: 13, color: "var(--fc-text-2)", maxWidth: 760 }}>
          Every governance action appends a hash-chained entry: each event's <span className="mono">prevHash</span> must equal the previous entry's <span className="mono">hash</span>.
        </div>
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <Panel>
        <PanelTitle
          right={
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input className="mono" style={{ border: "1px solid var(--fc-border)", borderRadius: 3, padding: "5px 9px", fontSize: 12, width: 170 }} placeholder="filter kind…" value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} />
              <input className="mono" style={{ border: "1px solid var(--fc-border)", borderRadius: 3, padding: "5px 9px", fontSize: 12, width: 190 }} placeholder="entity contains…" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} />
            </div>
          }
        >
          Chain integrity
        </PanelTitle>
        {busy ? (
          <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading chain…</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div
              style={{
                fontSize: 13, fontWeight: 600, padding: "10px 14px", borderRadius: 4,
                color: breakAt === null && intact !== false ? "var(--fc-green)" : "var(--fc-red)",
                background: breakAt === null && intact !== false ? "#E9F3EE" : "#F9E9E8",
                border: `1px solid ${breakAt === null && intact !== false ? "var(--fc-green)" : "var(--fc-red)"}`,
              }}
            >
              {breakAt === null && intact !== false
                ? `CHAIN INTACT — ${chain.length} event(s) verified client-side; every prevHash matches the previous hash.`
                : breakAt !== null
                  ? `CHAIN BREAK — linkage mismatch first detected at sequence ${breakAt}. Treat the trail as tampered.`
                  : "SERVER REPORTS CHAIN NOT INTACT — verify against the ledger."}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ border: "1px solid var(--fc-border)", borderRadius: 4, padding: "8px 12px", background: "#fff" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)" }}>First hash (genesis edge)</div>
                <div className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{firstHash ?? "—"}</div>
                <div style={{ fontSize: 10.5, color: "var(--fc-text-2)", marginTop: 4 }}>prevHash of first row: <span className="mono">{chain[0]?.prevHash ?? "—"}</span></div>
              </div>
              <div style={{ border: "1px solid var(--fc-border)", borderRadius: 4, padding: "8px 12px", background: "#fff" }}>
                <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)" }}>Last hash (chain head)</div>
                <div className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{lastHash ?? "—"}</div>
                <div style={{ fontSize: 10.5, color: "var(--fc-text-2)", marginTop: 4 }}>sequence head: <span className="mono">{chain[chain.length - 1]?.sequence ?? "—"}</span></div>
              </div>
            </div>
          </div>
        )}
      </Panel>

      <Panel>
        <PanelTitle right={<span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{shown.length} of {chain.length} shown</span>}>
          Events (newest first)
        </PanelTitle>
        <DataTable
          minWidth={980}
          columns={[
            { key: "seq", label: "Seq", width: "70px", mono: true },
            { key: "time", label: "Time", width: "165px" },
            { key: "kind", label: "Kind" },
            { key: "entity", label: "Entity", mono: true },
            { key: "actor", label: "Actor (org)" },
            { key: "detail", label: "Detail" },
          ]}
          rows={shown.map((e) => ({
            seq: <span className="mono" style={{ fontSize: 11 }}>{e.sequence}</span>,
            time: <span style={{ fontSize: 11.5, color: "var(--fc-text-2)", whiteSpace: "nowrap" }}>{fmt(e.timestamp)}</span>,
            kind: <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fc-navy)" }}>{e.kind}</span>,
            entity: <span className="mono" style={{ fontSize: 11 }}>{e.entity}</span>,
            actor: <span style={{ fontSize: 12 }}>{orgNames[e.actorOrganisationId ?? ""] ?? (e.actorOrganisationId ? `org ${e.actorOrganisationId.slice(0, 8)}…` : "system")}</span>,
            detail: <span style={{ fontSize: 12, color: "var(--fc-slate)" }}>{e.detail}</span>,
          }))}
        />
      </Panel>
    </div>
  );
}
