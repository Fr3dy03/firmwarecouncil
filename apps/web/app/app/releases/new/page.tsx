"use client";

/**
 * 10-STEP RELEASE WIZARD — manufacturer console.
 * Left step-rail + main form area + footer Back/Continue.
 * Submission goes to POST /api/v1/releases with the exact body the backend
 * expects (apps/api/src/services/releases.mts → proposeRelease):
 *   { productLineId, manifest, approvalRequirements, rolloutPolicy }
 * The signature step posts to POST /api/v1/releases/:id/signature with a
 * base64 Ed25519 signature over manifestDigest||releaseId (see e2e.mts).
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import {
  Panel, PanelTitle, Field, inputStyle, Button, ConfirmDialog, StatusPill, MonoRef,
} from "../../../../components/fc/ui";

interface ProductLine {
  id: string; name: string; productName: string; active: boolean;
  defaultArchitecture: string; compatibilityPolicy: string;
  hardwareRevisions: Array<{ id: string; revision: string; architecture: string }>;
}
interface ReleaseRow {
  id?: string; releaseId?: string; status: string; productLineId: string;
  organisationId?: string; manifest?: { version?: string };
}
interface SigningKey {
  id: string; label: string; publicKey: string; fingerprint: string;
  state: string; productScope: string[]; notes?: string;
}

interface StageForm {
  kind: string; targetPercent: string; minDwellMinutes: string;
  requiresManualAdvance: boolean; autoHaltOnFailurePercent: string;
}

/** Artifact hosts the backend allow-lists (apps/api/src/services/manifest.mts). */
const ALLOWED_HOSTS = ["artifacts.firmwarecouncil.local", "ota.mender-demo.local", "s3.firmwarecouncil.local"];
const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
const SHA256_RE = /^[a-f0-9]{64}$/;

const STEP_LABELS = [
  "Product line", "Version & build", "Artifact evidence", "Targets",
  "Chain & security notes", "Rollout plan", "Review manifest",
  "Signing key", "Submit", "Signature & confirm",
];

const SEED_STAGES: StageForm[] = [
  { kind: "SMALL", targetPercent: "10", minDwellMinutes: "30", requiresManualAdvance: true, autoHaltOnFailurePercent: "5" },
  { kind: "MEDIUM", targetPercent: "35", minDwellMinutes: "60", requiresManualAdvance: true, autoHaltOnFailurePercent: "5" },
  { kind: "LARGE", targetPercent: "70", minDwellMinutes: "60", requiresManualAdvance: true, autoHaltOnFailurePercent: "5" },
  { kind: "FULL", targetPercent: "100", minDwellMinutes: "120", requiresManualAdvance: false, autoHaltOnFailurePercent: "5" },
];

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "7px 0", borderBottom: "1px solid var(--fc-border)", fontSize: 13 }}>
      <div style={{ width: 210, flexShrink: 0, color: "var(--fc-text-2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, paddingTop: 2 }}>{k}</div>
      <div style={mono ? { fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" } : undefined}>{v}</div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 12, color: "var(--fc-text-2)", margin: "8px 0 14px" }}>{children}</p>;
}

export default function NewReleaseWizard() {
  // ---- data (product lines, releases for chaining, signing keys)
  const [productLines, setProductLines] = useState<ProductLine[]>([]);
  const [releases, setReleases] = useState<ReleaseRow[]>([]);
  const [keys, setKeys] = useState<SigningKey[]>([]);
  const [loadErr, setLoadErr] = useState("");

  // ---- wizard state
  const [step, setStep] = useState(1);
  const [stepErr, setStepErr] = useState("");

  // form
  const [productLineId, setProductLineId] = useState("");
  const [version, setVersion] = useState("");
  const [buildIdentifier, setBuildIdentifier] = useState("");
  const [artifactDigest, setArtifactDigest] = useState("");
  const [artifactSize, setArtifactSize] = useState("");
  const [artifactUrl, setArtifactUrl] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [compatibility, setCompatibility] = useState("");
  const [securityNotes, setSecurityNotes] = useState("");
  const [previousReleaseId, setPreviousReleaseId] = useState("");
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [canaryCohortSize, setCanaryCohortSize] = useState("3");
  const [stages, setStages] = useState<StageForm[]>([
    { kind: "CANARY", targetPercent: "5", minDwellMinutes: "30", requiresManualAdvance: true, autoHaltOnFailurePercent: "5" },
    { kind: "FULL", targetPercent: "100", minDwellMinutes: "60", requiresManualAdvance: true, autoHaltOnFailurePercent: "5" },
  ]);
  const [signingKeyId, setSigningKeyId] = useState("");

  // submit + signature state
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; status: string; manifestDigest: string } | null>(null);
  const [signature, setSignature] = useState("");
  const [signConfirm, setSignConfirm] = useState(false);
  const [signBusy, setSignBusy] = useState(false);
  const [signErr, setSignErr] = useState("");
  const [signOk, setSignOk] = useState("");

  const pl = productLines.find((p) => p.id === productLineId);
  const releaseId = result?.id ?? "";

  useEffect(() => {
    Promise.all([
      api<ProductLine[]>("/api/v1/product-lines"),
      api<ReleaseRow[]>("/api/v1/releases"),
      api<SigningKey[]>("/api/v1/keys"),
    ])
      .then(([pls, rel, ks]) => {
        setProductLines(pls.filter((p) => p.active));
        setReleases(rel);
        setKeys(ks.filter((k) => k.state === "ACTIVE"));
      })
      .catch((e) => setLoadErr(e?.message ?? String(e)));
  }, []);

  // ------------------------------------------------------------------ validate
  function validate(s: number): string {
    if (s === 1 && !productLineId) return "Select a product line to continue.";
    if (s === 2) {
      if (!SEMVER_RE.test(version)) return "Version must be semver like 3.4.1 or 3.4.1-rc.2 (backend enforces).";
      if (!buildIdentifier.trim()) return "Build identifier is required.";
    }
    if (s === 3) {
      if (!SHA256_RE.test(artifactDigest.trim())) return "Artifact digest must be a lowercase 64-char SHA-256 hex string.";
      const size = Number(artifactSize);
      if (!Number.isInteger(size) || size <= 0) return "Artifact size must be a positive integer (bytes).";
      let u: URL;
      try { u = new URL(artifactUrl.trim()); } catch { return "Artifact URL is not a valid URL."; }
      if (u.protocol !== "https:" && u.protocol !== "http:") return "Artifact URL must be http(s).";
      if (!ALLOWED_HOSTS.includes(u.hostname)) {
        return `artifactUrl host "${u.hostname}" is not in the backend allow-list (${ALLOWED_HOSTS.join(", ")}).`;
      }
    }
    if (s === 4) {
      if (targets.length === 0) return "Select at least one target hardware revision (backend enforces).";
      if (!compatibility.trim()) return "A product compatibility statement is required.";
    }
    if (s === 6 && policyEnabled) {
      const cohort = Number(canaryCohortSize);
      if (!Number.isInteger(cohort) || cohort < 1) return "Canary cohort size must be a positive integer.";
      if (stages.length === 0) return "Add at least one rollout stage.";
      for (const [i, st] of stages.entries()) {
        const pct = Number(st.targetPercent);
        const dwell = Number(st.minDwellMinutes);
        const halt = Number(st.autoHaltOnFailurePercent);
        if (!Number.isInteger(pct) || pct < 1 || pct > 100) return `Stage ${i + 1}: target percent must be 1..100.`;
        if (!Number.isInteger(dwell) || dwell < 0) return `Stage ${i + 1}: min dwell minutes must be >= 0.`;
        if (!Number.isInteger(halt) || halt < 0 || halt > 100) return `Stage ${i + 1}: auto-halt percent must be 0..100.`;
      }
    }
    return "";
  }

  function go(next: number) {
    // moving forward requires the current step to validate
    if (next > step) {
      const msg = validate(step);
      if (msg) { setStepErr(msg); return; }
      if (step === 9) { void submit(); return; } // step 9 "Continue" == submit
    }
    setStepErr("");
    setStep(next);
  }

  // ------------------------------------------------------------------ submit (step 9)
  async function submit() {
    if (!pl) { setStepErr("product line missing"); return; }
    setSubmitting(true);
    setStepErr("");
    try {
      const manifest: Record<string, unknown> = {
        version: version.trim(),
        buildIdentifier: buildIdentifier.trim(),
        targetRevisions: targets,
        artifactDigestSha256: artifactDigest.trim(),
        artifactSizeBytes: Number(artifactSize),
        artifactUrl: artifactUrl.trim(),
        productCompatibility: compatibility.trim(),
        securityNotes: securityNotes,
      };
      if (previousReleaseId) manifest.previousReleaseId = previousReleaseId;
      const release: any = await api<{ id?: string; releaseId?: string; manifest: { manifestDigest: string }; status: string }>(
        "/api/v1/releases",
        {
          method: "POST",
          body: {
            productLineId,
            manifest,
            approvalRequirements: { securityReviewerCount: 1, operatorApprovalRequired: true, crossOrg: true },
            rolloutPolicy: policyEnabled
              ? {
                  canaryCohortSize: Number(canaryCohortSize),
                  stages: stages.map((st) => ({
                    kind: st.kind,
                    targetPercent: Number(st.targetPercent),
                    minDwellMinutes: Number(st.minDwellMinutes),
                    requiresManualAdvance: st.requiresManualAdvance,
                    autoHaltOnFailurePercent: Number(st.autoHaltOnFailurePercent),
                  })),
                  requiresOperatorApproval: true,
                }
              : null,
          },
        },
      );
      const id = release?.id ?? release?.releaseId ?? "";
      if (!id) throw new ApiError(500, "no_release_id", "release created but no id returned");
      setResult({ id, status: release?.status ?? "PROPOSED", manifestDigest: release?.manifest?.manifestDigest ?? "" });
      setStepErr("");
      setStep(10);
    } catch (e) {
      const err = e as ApiError;
      setStepErr(err?.code ? `${err.code}: ${err.message}` : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ------------------------------------------------------------------ signature (step 10)
  const previousChoices = releases.filter(
    (r) => r.productLineId === productLineId && ["DEPLOYED", "ROLLOUT_IN_PROGRESS", "OPERATOR_APPROVED"].includes(r.status),
  );

  async function registerSignature() {
    setSignBusy(true);
    setSignErr("");
    try {
      await api(`/api/v1/releases/${releaseId}/signature`, { method: "POST", body: { signature: signature.trim() } });
      setSignOk("Manufacturer signature registered and verified against the organisation's ACTIVE key.");
    } catch (e) {
      const err = e as ApiError;
      setSignErr(err?.code ? `${err.code}: ${err.message}` : String(e));
    } finally {
      setSignBusy(false);
    }
  }

  // ------------------------------------------------------------------ render
  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>Manufacturer console</div>
        <h2 style={{ fontSize: "1.6rem", color: "var(--fc-navy)" }}>New release — 10-step governance wizard</h2>
        <p style={{ color: "var(--fc-text-2)", fontSize: 14 }}>
          Each step is explicit; the backend re-validates everything and computes the canonical manifest digest on submit.
        </p>
      </div>

      {loadErr ? (
        <Panel style={{ marginBottom: 22, borderLeft: "3px solid var(--fc-red)" }}>
          <PanelTitle>Load error</PanelTitle>
          <p style={{ fontSize: 13.5, color: "var(--fc-red)" }}>{loadErr}</p>
          <Button variant="ghost" onClick={() => location.reload()}>Retry</Button>
        </Panel>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0,1fr)", gap: 24, alignItems: "start" }}>
        {/* ---------------- step rail ---------------- */}
        <Panel pad={14} style={{ position: "sticky", top: 20 }}>
          <PanelTitle>Steps</PanelTitle>
          {STEP_LABELS.map((label, i) => {
            const n = i + 1;
            const done = n === 10 ? !!result : result ? true : n < step;
            const active = n === step;
            return (
              <button
                key={n}
                onClick={() => { setStepErr(""); setStep(n); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%", textAlign: "left",
                  background: "transparent", border: "none", cursor: "pointer", padding: "7px 4px",
                  borderTop: i === 0 ? "none" : "1px solid var(--fc-border)",
                  fontSize: 13, fontWeight: active ? 700 : 500,
                  color: active ? "var(--fc-blue)" : done ? "var(--fc-green)" : "var(--fc-text-2)",
                }}
              >
                <span className="mono" style={{ fontSize: 11, width: 18 }}>{done ? "✓" : String(n)}</span>
                {label}
              </button>
            );
          })}
        </Panel>

        {/* ---------------- main form area ---------------- */}
        <Panel>
          {stepErr ? (
            <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "10px 14px", fontSize: 13.5, marginBottom: 18 }}>
              {stepErr}
            </div>
          ) : null}

          {/* ---- 1 product line ---- */}
          {step === 1 ? (
            <>
              <PanelTitle>Step 1 · Product line</PanelTitle>
              <Hint>Only ACTIVE product lines of your organisation can receive proposals (both enforced server-side).</Hint>
              {productLines.length === 0 ? (
                <p style={{ fontSize: 13.5, color: "var(--fc-text-2)" }}>No active product lines registered for this organisation yet.</p>
              ) : (
                <Field label="Product line">
                  <select value={productLineId} onChange={(e) => { setProductLineId(e.target.value); setTargets([]); }} style={inputStyle}>
                    <option value="">— select —</option>
                    {productLines.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} — {p.productName}</option>
                    ))}
                  </select>
                </Field>
              )}
              {pl ? <Hint>{pl.productName} · compat policy: {pl.compatibilityPolicy} · arch: {pl.defaultArchitecture}</Hint> : null}
            </>
          ) : null}

          {/* ---- 2 version & build ---- */}
          {step === 2 ? (
            <>
              <PanelTitle>Step 2 · Version & build identity</PanelTitle>
              <Hint>Strict semver: `3.4.1`, `3.4.1-rc.2`. Build identifier joins the audit chain.</Hint>
              <Field label="Version (semver)">
                <input style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)} placeholder="3.4.2" />
              </Field>
              <Field label="Build identifier">
                <input style={inputStyle} value={buildIdentifier} onChange={(e) => setBuildIdentifier(e.target.value)} placeholder={`ST7-3.4.2-2026-11-06-a1b2`} />
              </Field>
            </>
          ) : null}

          {/* ---- 3 artifact evidence ---- */}
          {step === 3 ? (
            <>
              <PanelTitle>Step 3 · Artifact evidence</PanelTitle>
              <Hint>
                The binary is never uploaded here — provide evidence from your external OTA repository
                (e.g. <span className="mono">https://s3.firmwarecouncil.local/…</span>). SHA-256 digest: exactly 64 hex chars.
                The backend allow-lists artifact hosts: {ALLOWED_HOSTS.join(", ")}.
              </Hint>
              <Field label="artifactDigestSha256">
                <input className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12.5 }} value={artifactDigest} onChange={(e) => setArtifactDigest(e.target.value.toLowerCase())} placeholder="64-char lowercase sha256 hex" />
              </Field>
              <Field label="artifactSizeBytes" hint="Positive integer — bytes.">
                <input className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12.5 }} value={artifactSize} onChange={(e) => setArtifactSize(e.target.value.replace(/\D/g, ""))} placeholder="349112" />
              </Field>
              <Field label="artifactUrl" hint="External OTA repository URL — never uploaded to FirmwareCouncil.">
                <input style={inputStyle} value={artifactUrl} onChange={(e) => setArtifactUrl(e.target.value)} placeholder="https://s3.firmwarecouncil.local/st7/3.4.2/fw.bin" />
              </Field>
            </>
          ) : null}

          {/* ---- 4 targets ---- */}
          {step === 4 ? (
            <>
              <PanelTitle>Step 4 · Target hardware revisions</PanelTitle>
              <Hint>Multi-select from the product line's registered hardware revisions plus a compatibility statement.</Hint>
              {pl ? (
                <Field label="targetRevisions">
                  <div style={{ display: "grid", gap: 8 }}>
                    {pl.hardwareRevisions.map((rev) => (
                      <label key={rev.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5 }}>
                        <input
                          type="checkbox"
                          checked={targets.includes(rev.revision)}
                          onChange={(e) => setTargets((cur) => e.target.checked ? [...cur, rev.revision] : cur.filter((x) => x !== rev.revision))}
                        />
                        <strong>{rev.revision}</strong>
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>{rev.architecture}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              ) : <Hint>Select a product line in step 1 first.</Hint>}
              <Field label="Product compatibility statement">
                <input style={inputStyle} value={compatibility} onChange={(e) => setCompatibility(e.target.value)} placeholder="B3 bootloaders >=1.2; requires >= 3.2.0 installed" />
              </Field>
            </>
          ) : null}

          {/* ---- 5 chain & security notes ---- */}
          {step === 5 ? (
            <>
              <PanelTitle>Step 5 · Release chain & security notes</PanelTitle>
              <Hint>
                Optional. If you leave it blank the backend automatically chains this release to the newest
                stable release on the same product line (DEPLOYED / rollout in progress / operator-approved).
              </Hint>
              <Field label="previousReleaseId (optional)">
                <select value={previousReleaseId} onChange={(e) => setPreviousReleaseId(e.target.value)} style={inputStyle}>
                  <option value="">(auto) — backend derives the latest stable release</option>
                  {previousChoices.map((r) => {
                    const id = r.id ?? r.releaseId ?? "";
                    return <option key={id} value={id}>v{r.manifest?.version} · {r.status} · {id.slice(0, 8)}…</option>;
                  })}
                </select>
              </Field>
              <Field label="securityNotes" hint="May be empty; recorded into the manifest reviewed by security.">
                <textarea style={{ ...inputStyle, minHeight: 90, resize: "vertical" }} value={securityNotes} onChange={(e) => setSecurityNotes(e.target.value)} placeholder="Fixes buffer overrun in CAN parser; no protocol changes." />
              </Field>
            </>
          ) : null}

          {/* ---- 6 rollout plan ---- */}
          {step === 6 ? (
            <>
              <PanelTitle>Step 6 · Rollout plan</PanelTitle>
              <Hint>
                Included verbatim in the POST /api/v1/releases body — the backend accepts `rolloutPolicy`
                alongside the manifest (apps/api services/releases.mts), so no separate endpoint exists.
                Stages are re-sorted by targetPercent and get canonical order server-side.
              </Hint>
              <label style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, marginBottom: 16 }}>
                <input type="checkbox" checked={policyEnabled} onChange={(e) => setPolicyEnabled(e.target.checked)} />
                Attach a rollout policy (required for canary/rollout later — without one the release stops at operator approval)
              </label>
              {policyEnabled ? (
                <>
                  <Field label="canaryCohortSize" hint="Number of canary devices pulled from the product line's fleet when canary opens.">
                    <input className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12.5 }} value={canaryCohortSize} onChange={(e) => setCanaryCohortSize(e.target.value.replace(/\D/g, ""))} />
                  </Field>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fc-slate)", letterSpacing: "0.03em" }}>STAGES</div>
                    <span style={{ display: "flex", gap: 8 }}>
                      <Button variant="ghost" onClick={() => setStages(SEED_STAGES.map((s) => ({ ...s })))}>Pre-fill staged plan</Button>
                      <Button variant="ghost" onClick={() => setStages((cur) => [...cur, { kind: "SMALL", targetPercent: "25", minDwellMinutes: "30", requiresManualAdvance: true, autoHaltOnFailurePercent: "5" }])}>+ Add stage</Button>
                    </span>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {stages.map((st, i) => (
                      <Panel key={i} pad={12} style={{ display: "grid", gridTemplateColumns: "110px 110px 130px 150px 120px 36px", gap: 10, alignItems: "center" }}>
                        <select value={st.kind} onChange={(e) => setStages((cur) => cur.map((s, j) => j === i ? { ...s, kind: e.target.value } : s))} style={inputStyle}>
                          {["CANARY", "SMALL", "MEDIUM", "LARGE", "FULL"].map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                        <input aria-label="target %" className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }} value={st.targetPercent} onChange={(e) => setStages((cur) => cur.map((s, j) => j === i ? { ...s, targetPercent: e.target.value } : s))} placeholder="%" />
                        <input aria-label="dwell" className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }} value={st.minDwellMinutes} onChange={(e) => setStages((cur) => cur.map((s, j) => j === i ? { ...s, minDwellMinutes: e.target.value } : s))} placeholder="dwell min" />
                        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
                          <input type="checkbox" checked={st.requiresManualAdvance} onChange={(e) => setStages((cur) => cur.map((s, j) => j === i ? { ...s, requiresManualAdvance: e.target.checked } : s))} />
                          manual adv.
                        </label>
                        <input aria-label="auto halt %" className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12 }} value={st.autoHaltOnFailurePercent} onChange={(e) => setStages((cur) => cur.map((s, j) => j === i ? { ...s, autoHaltOnFailurePercent: e.target.value } : s))} placeholder="halt %" />
                        <Button variant="ghost" onClick={() => setStages((cur) => cur.filter((_, j) => j !== i))}>✕</Button>
                      </Panel>
                    ))}
                  </div>
                  <Hint>Columns: kind · targetPercent · minDwellMinutes · requiresManualAdvance · autoHaltOnFailurePercent.</Hint>
                </>
              ) : (
                <Hint>No rollout policy will be attached. The backend accepts `rolloutPolicy: null` but canary cannot be opened for this release.</Hint>
              )}
            </>
          ) : null}

          {/* ---- 7 review manifest ---- */}
          {step === 7 ? (
            <>
              <PanelTitle>Step 7 · Review manifest</PanelTitle>
              <Hint>
                Canonical digest (sha256 over sorted-key manifest JSON) is computed by the backend on submit —
                the digest column below is intentionally not invented client-side.
              </Hint>
              <KV k="Product line" v={pl ? `${pl.name} — ${pl.productName}` : "—"} />
              <KV k="Version" v={<span className="mono">{version || "—"}</span>} />
              <KV k="Build identifier" v={<span className="mono">{buildIdentifier || "—"}</span>} />
              <KV k="artifactDigestSha256" v={<span className="mono">{artifactDigest || "—"}</span>} />
              <KV k="artifactSizeBytes" v={<span className="mono">{artifactSize || "—"}</span>} />
              <KV k="artifactUrl" v={<span className="mono" style={{ wordBreak: "break-all" }}>{artifactUrl || "—"}</span>} />
              <KV k="targetRevisions" v={<span className="mono">{targets.join(" · ") || "—"}</span>} />
              <KV k="productCompatibility" v={compatibility || "—"} />
              <KV k="securityNotes" v={securityNotes || "(empty)"} />
              <KV k="previousReleaseId" v={previousReleaseId ? <span className="mono">{previousReleaseId}</span> : "auto (backend derives)"} />
              <KV k="manifestDigest" v={<em style={{ color: "var(--fc-text-2)" }}>computed on submit</em>} />
              {policyEnabled ? (
                <>
                  <div style={{ height: 18 }} />
                  <PanelTitle>Rollout policy (submitted verbatim)</PanelTitle>
                  {stages.map((st, i) => (
                    <KV key={i} k={`Stage ${i + 1} · ${st.kind}`} v={<span className="mono">{st.targetPercent}% · dwell {st.minDwellMinutes}min · {st.requiresManualAdvance ? "manual advance" : "auto advance"} · halt @{st.autoHaltOnFailurePercent}%</span>} />
                  ))}
                  <KV k="canaryCohortSize" v={<span className="mono">{canaryCohortSize}</span>} />
                </>
              ) : null}
            </>
          ) : null}

          {/* ---- 8 signing key ---- */}
          {step === 8 ? (
            <>
              <PanelTitle>Step 8 · Signing key</PanelTitle>
              <Hint>
                ACTIVE keys of your organisation are shown. The backend verifies the manufacturer signature
                against the organization's ACTIVE Ed25519 public key when you register it in step 10 — the
                private signing key never leaves your signing workstation/service.
              </Hint>
              {keys.length === 0 ? (
                <div style={{ border: "1px solid var(--fc-orange)", background: "var(--fc-pale-orange)", borderRadius: 4, padding: "10px 14px", fontSize: 13.5, color: "#B4600E" }}>
                  No ACTIVE signing keys registered — release signature registration will be refused until one exists (see Signing keys).
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {keys.map((k) => (
                    <label key={k.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", border: signingKeyId === k.id ? "1px solid var(--fc-blue)" : "1px solid var(--fc-border)", borderRadius: 4, padding: "10px 14px", cursor: "pointer", background: "#fff" }}>
                      <input type="radio" name="signingKey" checked={signingKeyId === k.id} onChange={() => setSigningKeyId(k.id)} style={{ marginTop: 4 }} />
                      <span style={{ fontSize: 13 }}>
                        <strong>{k.label}</strong>
                        <span style={{ display: "block", fontSize: 11.5, color: "var(--fc-text-2)" }}>pubkey ref <span className="mono">{k.publicKey.slice(0, 16)}…</span></span>
                        <span className="mono" style={{ display: "block", fontSize: 11.5, color: "var(--fc-slate)" }}>fp {k.fingerprint}</span>
                        {k.productScope?.length ? <span style={{ display: "block", fontSize: 11.5, color: "var(--fc-text-2)" }}>scope: {k.productScope.join(", ")}</span> : null}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {/* ---- 9 submit ---- */}
          {step === 9 ? (
            <>
              <PanelTitle>Step 9 · Submit proposal</PanelTitle>
              <Hint>
                Creates the release in status PROPOSED and appends to the audit chain. Registration of your
                device-grade signature happens in step 10.
              </Hint>
              <KV k="Product line" v={pl ? `${pl.name} — ${pl.productName}` : "—"} />
              <KV k="Version / build" v={<span className="mono">{version} · {buildIdentifier}</span>} />
              <KV k="Artifact" v={<span className="mono" style={{ wordBreak: "break-all" }}>{artifactDigest}</span>} />
              <KV k="Manifest digest" v={<em style={{ color: "var(--fc-text-2)" }}>computed on submit</em>} />
              <KV k="Approval requirements" v={<span className="mono">securityReviewerCount: 1 · operatorApprovalRequired: true · crossOrg: true</span>} />
              <KV k="Rollout policy" v={policyEnabled ? <span className="mono">{stages.length} stages · cohort {canaryCohortSize}</span> : "none attached"} />
              <div style={{ marginTop: 20 }}>
                <Button onClick={() => void submit()} disabled={submitting || !productLineId}>
                  {submitting ? "Submitting…" : "Submit release proposal"}
                </Button>
              </div>
            </>
          ) : null}

          {/* ---- 10 signature & confirm ---- */}
          {step === 10 ? (
            result ? (
              <>
                <PanelTitle>Step 10 · Signature & confirmation</PanelTitle>
                <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
                  <StatusPill status={result.status} />
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>release {result.id.slice(0, 8)}…</span>
                  <MonoRef value={result.manifestDigest} max={22} />
                </div>
                {signOk ? (
                  <div style={{ border: "1px solid var(--fc-green)", background: "#E9F3EE", color: "var(--fc-green)", borderRadius: 4, padding: "10px 14px", fontSize: 13.5, marginBottom: 16 }}>
                    {signOk}
                  </div>
                ) : null}
                {signErr ? (
                  <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "10px 14px", fontSize: 13.5, marginBottom: 16 }}>
                    {signErr}
                  </div>
                ) : null}
                <PanelTitle right={<span style={{ fontSize: 11, color: "var(--fc-text-2)" }}>POST /releases/{releaseId.slice(0, 8)}…/signature</span>}>
                  Manufacturer signature
                </PanelTitle>
                <Hint>
                  Your signing tool signs <span className="mono">manifestDigest ‖ releaseId</span> (raw bytes, Ed25519)
                  and produces a BASE64 signature paste below. Backend verifies against the org's ACTIVE key —
                  invalid signatures are refused and audited. Private keys never leave your workstation.
                </Hint>
                <Field label="signature (base64)">
                  <textarea className="mono" style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12, minHeight: 90, resize: "vertical" }} value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="base64 Ed25519 signature over manifestDigest||releaseId" />
                </Field>
                <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                  <Button onClick={() => setSignConfirm(true)} disabled={signBusy || !signOk && !signature.trim()}>
                    {signBusy ? "Registering…" : "Register signature"}
                  </Button>
                  <Button variant="ghost" href={`/app/releases/${releaseId}`}>Skip — open release control room</Button>
                </div>
                {signOk ? (
                  <div style={{ marginTop: 22 }}>
                    <Button href={`/app/releases/${releaseId}`}>Open release detail →</Button>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <PanelTitle>Step 10 · Signature & confirmation</PanelTitle>
                <Hint>Submit the proposal first (step 9) — the signature endpoint requires a release id.</Hint>
              </>
            )
          ) : null}

          {/* footer */}
          {step < 10 ? (
            <div style={{ display: "flex", gap: 10, marginTop: 26, paddingTop: 18, borderTop: "1px solid var(--fc-border)" }}>
              <Button variant="ghost" onClick={() => go(step - 1)} disabled={step === 1}>Back</Button>
              <span style={{ flex: 1 }} />
              <Button onClick={() => go(step + 1)} disabled={step === 1 && !productLineId || submitting}>
                {step === 9 ? (submitting ? "Submitting…" : "Submit proposal") : "Continue"}
              </Button>
            </div>
          ) : null}
        </Panel>
      </div>

      {signConfirm ? (
        <ConfirmDialog
          title="Register manufacturer signature"
          confirmLabel={signBusy ? "Registering…" : "Register"}
          onConfirm={() => { void registerSignature(); }}
          onClose={() => setSignConfirm(false)}
          body={
            <>
              The backend verifies the pasted Ed25519 signature against your organisation's ACTIVE key
              over <span className="mono">manifestDigest ‖ releaseId</span>. Invalid signatures are refused and audited.
            </>
          }
        />
      ) : null}
    </div>
  );
}
