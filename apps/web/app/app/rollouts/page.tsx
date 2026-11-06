"use client";

/**
 * Rollout index — releases whose deployment is live or halted.
 * Endpoint: GET /api/v1/releases (list rows carry the full release record,
 * productName, manufacturerOrgName — no rollout state), then GET
 * /api/v1/releases/:id per active release for rolloutState (stage + progress).
 * Filter statuses: CANARY_RUNNING, ROLLOUT_IN_PROGRESS, PAUSED, CANARY_FAILED.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { DataTable, EmptyState, Panel, PanelTitle, StatusPill } from "../../../components/fc/ui";

const ACTIVE_STATUSES = ["CANARY_RUNNING", "ROLLOUT_IN_PROGRESS", "PAUSED", "CANARY_FAILED"];

interface ReleaseRow {
  id: string;
  status: string;
  createdAt: string;
  productLineId: string;
  productName: string;
  manufacturerOrgName: string;
  manifest: { version: string };
  rolloutState?: {
    currentStageOrder: number;
    status: string;
    stageStartedAt?: string | null;
    progress?: { eligibleDevices: number; contacted: number; successes: number; failures: number; offline: number };
  } | null;
}

const STAGE_LABEL: Record<number, string> = { 0: "CANARY", 1: "SMALL", 2: "MEDIUM", 3: "LARGE", 4: "FULL" };

export default function RolloutsPage() {
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const releases = await api<(Omit<ReleaseRow, "rolloutState"> & { rolloutState?: unknown })[]>("/api/v1/releases");
        const active = releases.filter((r) => ACTIVE_STATUSES.includes(r.status));
        const enriched = await Promise.allSettled(
          active.map(async (r): Promise<ReleaseRow> => {
            const detail = await api<ReleaseRow>(`/api/v1/releases/${r.id}`);
            return { ...r, rolloutState: detail.rolloutState ?? null };
          }),
        );
        if (!alive) return;
        const ok: ReleaseRow[] = [];
        for (const e of enriched) {
          if (e.status === "fulfilled") ok.push(e.value);
        }
        setRows(ok);
        const failed = enriched.filter((e) => e.status === "rejected");
        if (failed.length) setError(failed.length + " active rollout(s) could not be loaded");
      } catch (e: unknown) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const tableRows = rows.map((r) => {
    const stage = r.rolloutState?.currentStageOrder ?? 0;
    const p = r.rolloutState?.progress;
    return {
      release: (
        <Link href={`/app/rollouts/${r.id}`} style={{ color: "var(--fc-blue)", fontWeight: 600 }}>
          <span className="mono" style={{ fontSize: 12.5 }}>v{r.manifest?.version}</span>
        </Link>
      ),
      product: <span style={{ fontSize: 12.5 }}>{r.productName}</span>,
      status: <StatusPill status={r.status} small />,
      stage: <span className="mono" style={{ fontSize: 12 }}>{STAGE_LABEL[stage] ?? `STAGE ${stage}`}</span>,
      progress: p ? (
        <span className="mono" style={{ fontSize: 11.5 }}>
          {p.contacted}/{p.eligibleDevices} contacted · {p.successes} ok · {p.failures} fail{p.offline ? ` · ${p.offline} offline` : ""}
        </span>
      ) : <span style={{ color: "var(--fc-text-2)", fontSize: 12 }}>—</span>,
      started: <span style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{r.rolloutState?.stageStartedAt ? new Date(r.rolloutState.stageStartedAt).toLocaleString() : "—"}</span>,
      open: <Link href={`/app/rollouts/${r.id}`} style={{ fontSize: 13 }}>Control room</Link>,
    };
  });

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Deployment oversight</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Rollouts</h1>
          <div style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
            Every release currently in canary, staged rollout, paused, or halted with a failed canary.
          </div>
        </div>
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <Panel>
        <PanelTitle right={<span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{tableRows.length} active rollout(s)</span>}>
          Active rollout queue
        </PanelTitle>
        {busy ? (
          <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading rollouts…</div>
        ) : tableRows.length === 0 ? (
          <EmptyState
            title="No active rollouts"
            body="No release is currently running a canary or staged rollout. A rollout appears here after the operator opens the canary — see /app/releases for states that precede deployment."
          />
        ) : (
          <DataTable
            minWidth={860}
            columns={[
              { key: "release", label: "Release" },
              { key: "product", label: "Product line" },
              { key: "status", label: "Status" },
              { key: "stage", label: "Current stage" },
              { key: "progress", label: "Progress" },
              { key: "started", label: "Stage started" },
              { key: "open", label: "" },
            ]}
            rows={tableRows}
          />
        )}
      </Panel>
    </div>
  );
}
