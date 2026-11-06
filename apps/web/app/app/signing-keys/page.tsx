"use client";

/**
 * Signing keys registry.
 * Endpoints (exact, routes/index.mts §signing keys):
 *  GET  /api/v1/keys              → keys of the session organisation (historical)
 *  POST /api/v1/keys              body {organisationId, label, publicKey,
 *       productScope?, expiresAt?, notes?}  → keys.registerKey({body, actorUserId})
 *  POST /api/v1/keys/:id/rotate   body {publicKey, label}
 *  POST /api/v1/keys/:id/revoke   (no body)
 *  GET  /api/v1/keys/manifest     → {manifestVersion, issuedAt, keys[], manifestDigest}
 * Public Ed25519 material only — private keys never leave the workstation/HSM.
 */
import { useEffect, useState } from "react";
import { api, useSession } from "../../../lib/api";
import { Button, ConfirmDialog, DataTable, Field, Modal, Panel, PanelTitle, StatusPill, inputStyle } from "../../../components/fc/ui";
import type { SigningKey } from "../../../../../packages/shared/src/types";

interface KeyManifest {
  manifestVersion: number;
  issuedAt: string;
  keys: Array<{ kid: string; publicKey: string; state: string; productScope: string[]; expiresAt: string | null }>;
  manifestDigest: string;
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

export default function SigningKeysPage() {
  const { user } = useSession();
  const [keys, setKeys] = useState<SigningKey[]>([]);
  const [manifest, setManifest] = useState<KeyManifest | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  // register modal
  const [registerOpen, setRegisterOpen] = useState(false);
  const [reg, setReg] = useState({ label: "", publicKey: "", productScope: "" });
  // rotate modal
  const [rotateTarget, setRotateTarget] = useState<SigningKey | null>(null);
  const [rot, setRot] = useState({ label: "", publicKey: "" });
  // revoke confirm
  const [revokeTarget, setRevokeTarget] = useState<SigningKey | null>(null);

  const load = async () => {
    setBusy(true);
    setError(null);
    try {
      const [k, m] = await Promise.all([
        api<SigningKey[]>("/api/v1/keys"),
        api<KeyManifest>("/api/v1/keys/manifest"),
      ]);
      setKeys(k);
      setManifest(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const isManufacturer = user?.role === "MANUFACTURER" || user?.role === "PLATFORM_ADMIN";

  async function post(path: string, body?: unknown) {
    setMutating(true);
    setMutationError(null);
    try {
      await api(path, { method: "POST", ...(body !== undefined ? { body } : {}) });
      setRegisterOpen(false);
      setRotateTarget(null);
      setRevokeTarget(null);
      await load();
      return true;
    } catch (e: unknown) {
      setMutationError(e instanceof Error ? e.message : String(e));
      setRegisterOpen(false);
      setRotateTarget(null);
      setRevokeTarget(null);
      return false;
    } finally {
      setMutating(false);
    }
  }

  const rows = keys.map((k) => ({
    label: <span style={{ fontWeight: 600, color: "var(--fc-navy)", fontSize: 13 }}>{k.label}</span>,
    fingerprint: <span className="mono" style={{ fontSize: 10.5 }}>{k.fingerprint}</span>,
    scope: <span className="mono" style={{ fontSize: 11.5 }}>{k.productScope?.length ? k.productScope.join(", ") : "all product lines"}</span>,
    state: <StatusPill status={k.state} small />,
    validFrom: <span style={{ fontSize: 12 }}>{fmt(k.validFrom)}</span>,
    expiresAt: <span style={{ fontSize: 12 }}>{fmt(k.expiresAt)}</span>,
    revokedAt: <span style={{ fontSize: 12 }}>{k.revokedAt ? fmt(k.revokedAt) : "—"}</span>,
    rotatedFrom: k.rotatedFrom ? <span className="mono" style={{ fontSize: 10.5 }}>{k.rotatedFrom.slice(0, 8)}…</span> : <span style={{ color: "var(--fc-text-2)" }}>—</span>,
    actions: isManufacturer && (k.state === "ACTIVE" || k.state === "ROTATING") ? (
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={() => { setRot({ label: `${k.label} (rotated)`, publicKey: "" }); setRotateTarget(k); }}
          style={{ background: "transparent", border: "1px solid var(--fc-border)", color: "var(--fc-slate)", fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 3, cursor: "pointer" }}
        >
          Rotate
        </button>
        <button
          onClick={() => setRevokeTarget(k)}
          style={{ background: "transparent", border: "1px solid var(--fc-red)", color: "var(--fc-red)", fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 3, cursor: "pointer" }}
        >
          Revoke
        </button>
      </div>
    ) : <span style={{ color: "var(--fc-text-2)", fontSize: 12 }}>—</span>,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Trust registry</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Signing keys</h1>
          <div style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
            Public Ed25519 verification keys for your organisation. Private keys never leave your workstation/HSM — this registry stores and fingerprints public material only.
          </div>
        </div>
        <span style={{ flex: 1 }} />
        {isManufacturer ? <Button onClick={() => { setReg({ label: "", publicKey: "", productScope: "" }); setMutationError(null); setRegisterOpen(true); }}>Register key</Button> : null}
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}
      {mutationError ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {mutationError}
        </div>
      ) : null}

      <Panel>
        <PanelTitle right={<span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{keys.length} key(s)</span>}>
          Key history (oldest first)
        </PanelTitle>
        {busy ? <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading keys…</div> : (
          <DataTable
            minWidth={1000}
            columns={[
              { key: "label", label: "Label" },
              { key: "fingerprint", label: "Fingerprint" },
              { key: "scope", label: "Scope" },
              { key: "state", label: "State", width: "110px" },
              { key: "validFrom", label: "Valid from", width: "105px" },
              { key: "expiresAt", label: "Expires", width: "105px" },
              { key: "revokedAt", label: "Revoked at", width: "105px" },
              { key: "rotatedFrom", label: "Rotated from", width: "105px" },
              { key: "actions", label: "", width: "160px" },
            ]}
            rows={rows}
          />
        )}
      </Panel>

      <Panel>
        <PanelTitle right={
          manifest ? <span className="mono" style={{ fontSize: 11, color: "var(--fc-text-2)" }}>issued {new Date(manifest.issuedAt).toLocaleString()}</span> : undefined
        }>
          Verified key manifest
        </PanelTitle>
        <div style={{ fontSize: 12.5, color: "var(--fc-slate)", marginBottom: 10 }}>
          Snapshot of the org's keys exactly as devices and reviewers should resolve them (TUF-style).
        </div>
        {!busy && manifest ? (
          <pre className="mono" style={{
            margin: 0, padding: 14, background: "var(--fc-navy)", color: "#C7D5E0",
            fontSize: 11.5, borderRadius: 4, overflowX: "auto", lineHeight: 1.55,
          }}>
{JSON.stringify(manifest, null, 2)}
          </pre>
        ) : (
          <div className="mono" style={{ fontSize: 12, color: "var(--fc-text-2)" }}>{busy ? "Loading manifest…" : "Manifest unavailable."}</div>
        )}
      </Panel>

      {registerOpen ? (
        <Modal
          title="Register signing key"
          onClose={() => setRegisterOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRegisterOpen(false)}>Cancel</Button>
              <Button
                disabled={mutating || !reg.label.trim() || !reg.publicKey.trim()}
                onClick={() => {
                  void post("/api/v1/keys", {
                    organisationId: user?.organisationId,
                    label: reg.label.trim(),
                    publicKey: reg.publicKey.trim(),
                    productScope: reg.productScope.split(",").map((s) => s.trim()).filter(Boolean),
                  });
                }}
              >
                {mutating ? "Registering…" : "Register key"}
              </Button>
            </>
          }
        >
          <Field label="Label">
            <input style={inputStyle} value={reg.label} onChange={(e) => setReg((r) => ({ ...r, label: e.target.value }))} placeholder="Ardane ST-7 release signing (HSM-backed)" autoFocus />
          </Field>
          <Field
            label="Public key (base64, raw Ed25519)"
            hint="Paste the PUBLIC key only — never private material. Private signing keys must never leave your workstation or HSM."
          >
            <textarea className="mono" style={{ ...inputStyle, minHeight: 90, fontSize: 12.5 }} value={reg.publicKey} onChange={(e) => setReg((r) => ({ ...r, publicKey: e.target.value }))} placeholder="mCuV0T3HqkL2ZRQhQk0d3+5Oq2jw0qZLz0+N41yRzPE=" />
          </Field>
          <Field label="Product scope (optional, comma list)" hint="Empty scope covers all product lines of your organisation.">
            <input className="mono" style={inputStyle} value={reg.productScope} onChange={(e) => setReg((r) => ({ ...r, productScope: e.target.value }))} placeholder="Ardane ST-7 (TX module)" />
          </Field>
          <div style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
            The API validates that the material parses as a 32-byte Ed25519 public key and records a SHA-256 fingerprint.
          </div>
        </Modal>
      ) : null}

      {rotateTarget ? (
        <Modal
          title={`Rotate key — ${rotateTarget.label}`}
          onClose={() => setRotateTarget(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setRotateTarget(null)}>Cancel</Button>
              <Button
                disabled={mutating || !rot.label.trim() || !rot.publicKey.trim()}
                onClick={() => { void post(`/api/v1/keys/${rotateTarget.id}/rotate`, { publicKey: rot.publicKey.trim(), label: rot.label.trim() }); }}
              >
                {mutating ? "Rotating…" : "Rotate"}
              </Button>
            </>
          }
        >
          <Field label="New label">
            <input style={inputStyle} value={rot.label} onChange={(e) => setRot((r) => ({ ...r, label: e.target.value }))} />
          </Field>
          <Field label="New public key (base64 raw Ed25519)" hint="Public material only. The old key moves to ROTATING; the new key records rotated-from lineage.">
            <textarea className="mono" style={{ ...inputStyle, minHeight: 90, fontSize: 12.5 }} value={rot.publicKey} onChange={(e) => setRot((r) => ({ ...r, publicKey: e.target.value }))} />
          </Field>
        </Modal>
      ) : null}

      {revokeTarget ? (
        <ConfirmDialog
          title="Revoke signing key"
          tone="danger"
          confirmLabel={mutating ? "Revoking…" : "Revoke key"}
          body={`Revoke "${revokeTarget.label}" (fingerprint ${revokeTarget.fingerprint.slice(0, 12)}…)? Verification is refused immediately for artifacts signed with this key. This is recorded on the audit chain and cannot be undone.`}
          onConfirm={() => { void post(`/api/v1/keys/${revokeTarget.id}/revoke`); }}
          onClose={() => setRevokeTarget(null)}
        />
      ) : null}
    </div>
  );
}
