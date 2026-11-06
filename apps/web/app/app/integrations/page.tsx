"use client";

/**
 * OTA integrations registry — honest adapter status.
 * Endpoints (exact, routes/index.mts §integrations):
 *  GET  /api/v1/integrations           → OTAIntegration rows
 *  POST /api/v1/integrations/:id/verify → adapter.verify() → AdapterCheck
 *       {ok, provider, verified, message} — the simulator returns verified:
 *       true; mender/hawkbit/balena remain  verified:false  until sandbox
 *       smoke testing, and can fail to reach their endpoints entirely.
 * Tone per docs/OTA_INTEGRATIONS.md: FirmwareCouncil is not an OTA provider
 * and never claims an adapter works before tested credentials.
 */
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { Button, ConfirmDialog, EmptyState, Panel, StatusPill } from "../../../components/fc/ui";
import type { OTAIntegration } from "../../../../../packages/shared/src/types";

interface AdapterCheck {
  ok: boolean;
  provider: string;
  verified: boolean;
  message: string;
}

const KIND_NOTE: Record<string, string> = {
  simulator: "Reference adapter — models device inventory, deployment refs and installation outcomes locally so the whole governance loop can run without external credentials.",
  mender: "Implemented against the documented Mender Management API (inventory, deployments, status). Personal access tokens expire weekly — CI automation must use PATs.",
  hawkbit: "DDI/Mgmt split; hawkBit rollout groups map directly onto FirmwareCouncil's staged rollout windows with pause/stop for incidents.",
  balena: "Fleet = devices pinned to a Release; release freeze maps onto FirmwareCouncil's supersede + rollback-authorise semantics.",
};

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<OTAIntegration[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<Record<string, AdapterCheck | { error: string }>>({});
  const [verifying, setVerifying] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<OTAIntegration | null>(null);

  useEffect(() => {
    let alive = true;
    api<OTAIntegration[]>("/api/v1/integrations")
      .then((v) => { if (alive) setIntegrations(v); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, []);

  async function runVerify(id: string) {
    setVerifying(id);
    try {
      const check = await api<AdapterCheck>(`/api/v1/integrations/${id}/verify`, { method: "POST" });
      setVerifyResult((m) => ({ ...m, [id]: check }));
    } catch (e: unknown) {
      setVerifyResult((m) => ({ ...m, [id]: { error: e instanceof Error ? e.message : String(e) } }));
    } finally {
      setVerifying(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 4 }}>OTA registry</div>
        <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Integrations</h1>
        <div style={{ fontSize: 13.5, color: "var(--fc-text-2)", maxWidth: 760, marginTop: 6 }}>
          FirmwareCouncil is deliberately not an OTA provider. It coordinates digests, approvals and audit while the
          configured platform moves the bits. Every adapter below is <strong>shape-only until its own sandbox smoke
          test passes</strong> — only the simulator adapter ships verified, by design.
        </div>
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      {busy ? (
        <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading integrations…</div>
      ) : integrations.length === 0 ? (
        <EmptyState title="No integrations registered" body="OTA adapters are enabled per integration row holding provider, credential reference and sandbox/base URL. This deployment has none." />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {integrations.map((it) => {
            const r = verifyResult[it.id];
            const checking = verifying === it.id;
            return (
              <Panel key={it.id} style={{ display: "grid", gap: 10, alignContent: "start" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontWeight: 600, color: "var(--fc-navy)", fontSize: 14.5, letterSpacing: "0.02em" }}>{it.label}</span>
                  <span style={{ flex: 1 }} />
                  {it.verified ? <StatusPill status="CANARY_PASSED" small /> : <StatusPill status="PENDING" small />}
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span className="mono" style={{ fontSize: 11.5, fontWeight: 600, color: "var(--fc-blue)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{it.kind}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
                    {it.verified
                      ? <span style={{ color: "var(--fc-green)", fontWeight: 600 }}>verified — sandbox smoke test passed</span>
                      : <span style={{ color: "#B4600E", fontWeight: 600 }}>unverified — shape only</span>}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", rowGap: 4, columnGap: 10, fontSize: 12 }}>
                  <div style={{ color: "var(--fc-text-2)" }}>Base URL</div><div className="mono" style={{ fontSize: 11, wordBreak: "break-all" }}>{it.baseUrl}</div>
                  <div style={{ color: "var(--fc-text-2)" }}>Credential</div><div className="mono" style={{ fontSize: 11 }}>{it.credentialRef}</div>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--fc-text-2)", lineHeight: 1.5 }}>
                  {KIND_NOTE[it.kind] ?? "Adapter status is recorded in the onboarded registry."}
                </div>
                <div>
                  <Button variant="secondary" disabled={checking} onClick={() => setConfirmTarget(it)}>
                    {checking ? "Running smoke test…" : it.verified ? "Re-run verify" : "Verify"}
                  </Button>
                </div>
                {r ? (
                  "error" in r ? (
                    <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "8px 12px", fontSize: 12 }}>
                      Verify call failed: {r.error}
                    </div>
                  ) : (
                    <div style={{
                      border: `1px solid ${r.ok ? "var(--fc-border)" : "var(--fc-red)"}`,
                      background: r.ok ? "var(--fc-pale-blue)" : "#F9E9E8",
                      borderRadius: 4, padding: "8px 12px", fontSize: 12,
                    }}>
                      <div style={{ fontWeight: 600, color: r.ok ? "var(--fc-blue)" : "var(--fc-red)" }}>
                        Adapter says · ok: {String(r.ok)} · verified: {String(r.verified)}
                      </div>
                      <div style={{ color: "var(--fc-slate)", marginTop: 2 }}>{r.message}</div>
                    </div>
                  )
                ) : null}
              </Panel>
            );
          })}
        </div>
      )}

      {confirmTarget ? (
        <ConfirmDialog
          title={`Run verify — ${confirmTarget.kind}`}
          confirmLabel="Run verify"
          body={
            confirmTarget.kind === "simulator"
              ? "The simulator adapter performs a local smoke check and returns verified: true."
              : `The ${confirmTarget.kind} adapter will attempt a live connectivity check against ${confirmTarget.baseUrl} using the referenced credential (${confirmTarget.credentialRef}). ` +
                "Non-simulator adapters are documented implementations that stay verified: false until a developer completes the sandbox smoke test; expect either a reachable-but-unverified result or a connection error. The raw result is shown unchanged."
          }
          onConfirm={() => { void runVerify(confirmTarget.id); }}
          onClose={() => setConfirmTarget(null)}
        />
      ) : null}
    </div>
  );
}
