"use client";

/**
 * FirmwareCouncil industrial UI component library (foundation layer).
 * Used by both the marketing site and the /app control room.
 * Visual language: precise, dense, unambiguous — no neon, no gradients.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

const VAR = {
  bg: "var(--fc-bg)", surface: "var(--fc-surface)", navy: "var(--fc-navy)",
  slate: "var(--fc-slate)", text: "var(--fc-text)", mute: "var(--fc-text-2)",
  blue: "var(--fc-blue)", paleBlue: "var(--fc-pale-blue)", green: "var(--fc-green)",
  orange: "var(--fc-orange)", paleOrange: "var(--fc-pale-orange)",
  red: "var(--fc-red)", border: "var(--fc-border)",
};

const TONE_BG: Record<string, string> = {
  ok: "#E9F3EE", warn: "var(--fc-pale-orange)", bad: "#F9E9E8", info: "var(--fc-pale-blue)", neutral: "#ECF0F2",
};
const TONE_FG: Record<string, string> = {
  ok: "var(--fc-green)", warn: "#B4600E", bad: "var(--fc-red)", info: "var(--fc-blue)", neutral: "var(--fc-slate)",
};

const STATUS_TONE: Record<string, keyof typeof TONE_FG> = {
  PROPOSED: "neutral",
  CHANGES_REQUESTED: "warn", REQUEST_CHANGES: "warn",
  SECURITY_APPROVED: "info", OPERATOR_APPROVED: "info",
  REJECTED: "bad", REVOKED: "bad", CANARY_FAILED: "bad", ROLLBACK_AUTHORISED: "bad", FAILURE: "bad",
  CANARY_RUNNING: "warn", PAUSED: "warn", MITIGATING: "warn", MEDIUM: "warn", HIGH: "warn", CRITICAL: "bad", PENDING: "warn", OUTDATED: "warn",
  CANARY_PASSED: "ok", DEPLOYED: "ok", ONLINE: "ok", RESOLVED: "ok", SUCCESS: "ok", APPROVE: "ok", LOW: "neutral",
  ROLLOUT_IN_PROGRESS: "info", OPEN: "bad",
  DRAFT: "neutral", SUPERSEDED: "neutral", OFFLINE: "neutral", RETIRED: "neutral", REJECTED_UPTAKE: "bad",
};

export function toneFor(status?: string): keyof typeof TONE_FG {
  if (status && STATUS_TONE[status]) return STATUS_TONE[status];
  return "neutral";
}

export function StatusPill({ status, small }: { status: string; small?: boolean }) {
  const tone = toneFor(status);
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: TONE_BG[tone], color: TONE_FG[tone],
        fontSize: small ? 10.5 : 12, fontWeight: 600, letterSpacing: "0.04em",
        padding: small ? "2px 7px" : "3px 10px", borderRadius: 3, textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 1, background: TONE_FG[tone], flexShrink: 0 }} />
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function MonoRef({ value, max = 14 }: { value?: string | null; max?: number }) {
  if (!value) return <span style={{ color: VAR.mute }}>—</span>;
  const v = value.length > max ? `${value.slice(0, max)}…` : value;
  return <span className="mono" style={{ fontSize: 12, color: VAR.slate }}>{v}</span>;
}

export function Panel({ children, pad = 20, style }: { children: ReactNode; pad?: number; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: VAR.surface, border: `1px solid ${VAR.border}`, borderRadius: 6,
      boxShadow: "0 1px 2px rgba(23,37,54,.06)", padding: pad, ...style,
    }}>
      {children}
    </div>
  );
}

export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: VAR.navy, textTransform: "uppercase", letterSpacing: "0.05em" }}>{children}</div>
      {right}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div style={{ maxWidth: 760, marginBottom: 36 }}>
      {eyebrow ? <div className="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</div> : null}
      <h2 style={{ fontSize: "clamp(1.7rem,3vw,2.3rem)", color: VAR.navy, lineHeight: 1.15, marginBottom: 12 }}>{title}</h2>
      {sub ? <p style={{ color: VAR.mute, fontSize: 16 }}>{sub}</p> : null}
    </div>
  );
}

export function Button({
  children, onClick, variant = "primary", type = "button", disabled, href, full,
}: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger";
  type?: "button" | "submit"; disabled?: boolean; href?: string; full?: boolean;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: VAR.blue, color: "#fff", border: `1px solid ${VAR.blue}` },
    secondary: { background: "transparent", color: VAR.blue, border: `1px solid ${VAR.blue}` },
    ghost: { background: "transparent", color: VAR.slate, border: `1px solid ${VAR.border}` },
    danger: { background: VAR.red, color: "#fff", border: `1px solid ${VAR.red}` },
  };
  const cls = styles[variant];
  if (href) {
    return (
      <a href={href} style={{
        ...cls, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
        fontSize: 14, fontWeight: 600, padding: "10px 20px", borderRadius: 4,
        textDecoration: "none", ...(full ? { width: "100%" } : {}),
      }}
        onMouseOver={(e) => { e.currentTarget.style.opacity = "0.92"; }}
        onMouseOut={(e) => { e.currentTarget.style.opacity = "1"; }}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type={type} onClick={onClick} disabled={disabled}
      style={{
        ...cls, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1,
        fontSize: 14, fontWeight: 600, padding: "10px 20px", borderRadius: 4, fontFamily: "inherit",
        ...(full ? { width: "100%" } : {}),
      }}
    >
      {children}
    </button>
  );
}

export function Field({
  label, children, hint,
}: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: VAR.slate, marginBottom: 6, letterSpacing: "0.03em" }}>{label}</div>
      {children}
      {hint ? <div style={{ fontSize: 11.5, color: VAR.mute, marginTop: 5 }}>{hint}</div> : null}
    </label>
  );
}

export const inputStyle: React.CSSProperties = {
  width: "100%", padding: "9px 12px", fontSize: 14, fontFamily: "inherit",
  border: `1px solid ${VAR.border}`, borderRadius: 4, background: "#fff", color: VAR.text,
  outline: "none",
};

export function Modal({
  title, children, onClose, footer, width = 560,
}: { title: string; children: ReactNode; onClose: () => void; footer?: ReactNode; width?: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(23,37,54,.45)", zIndex: 200,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "8vh 20px",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: VAR.surface, borderRadius: 6, boxShadow: "0 12px 40px rgba(23,37,54,.25)",
        width: "100%", maxWidth: width, border: `1px solid ${VAR.border}`,
      }}>
        <div style={{ padding: "16px 22px", borderBottom: `1px solid ${VAR.border}` }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: VAR.navy }}>{title}</div>
        </div>
        <div style={{ padding: "20px 22px", maxHeight: "60vh", overflowY: "auto" }}>{children}</div>
        {footer ? (
          <div style={{ padding: "14px 22px", borderTop: `1px solid ${VAR.border}`, display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title, body, confirmLabel, tone = "primary", onConfirm, onClose,
}: { title: string; body: ReactNode; confirmLabel: string; tone?: "primary" | "danger"; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} width={480} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={tone} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
      </>
    }>
      <p style={{ fontSize: 14.5, color: VAR.slate }}>{body}</p>
    </Modal>
  );
}

export function IncidentBanner({ severity, title, detail }: { severity: string; title: string; detail: string }) {
  const bad = ["HIGH", "CRITICAL", "OPEN"].includes(severity);
  return (
    <div style={{
      border: `1px solid ${bad ? VAR.red : VAR.orange}`,
      borderLeftWidth: 4, borderRadius: 4, background: bad ? "#F9E9E8" : VAR.paleOrange,
      padding: "12px 16px", display: "flex", gap: 12, alignItems: "flex-start",
    }}>
      <div style={{ width: 8, height: 8, borderRadius: 2, background: bad ? VAR.red : VAR.orange, marginTop: 6, flexShrink: 0 }} />
      <div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: bad ? VAR.red : "#B4600E" }}>
          {severity} — {title}
        </div>
        <div style={{ fontSize: 13, color: VAR.slate, marginTop: 2 }}>{detail}</div>
      </div>
    </div>
  );
}

export function Metric({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "ok" | "warn" | "bad" }) {
  return (
    <Panel pad={14}>
      <div style={{ fontSize: 11, fontWeight: 600, color: VAR.mute, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: tone ? TONE_FG[tone] : VAR.navy, fontFamily: "var(--font-mono)", marginTop: 2 }}>{value}</div>
      {hint ? <div style={{ fontSize: 11.5, color: VAR.mute }}>{hint}</div> : null}
    </Panel>
  );
}

/** Horizontal RELEASE TRAIN — the signature governance visual. */
export function ReleaseTrain({ steps }: { steps: ReleaseTrainStep[] }) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "stretch", flex: "1 1 0", minWidth: 150 }}>
          <div style={{
            flex: 1, borderTop: `3px solid ${s.state === "done" ? VAR.green : s.state === "active" ? VAR.orange : s.state === "rejected" ? VAR.red : VAR.border}`,
            paddingTop: 10, paddingRight: 12, position: "relative",
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.07em", color: VAR.mute, textTransform: "uppercase" }}>STEP {i + 1}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: s.state === "pending" ? VAR.mute : VAR.navy, margin: "2px 0 6px" }}>{s.name}</div>
            <div style={{ fontSize: 11.5, color: s.state === "done" ? TONE_FG.ok : s.state === "active" ? TONE_FG.warn : s.state === "rejected" ? TONE_FG.bad : VAR.mute, textTransform: "uppercase", fontWeight: 600 }}>
              {s.state === "done" ? "CLEARED" : s.state === "active" ? "IN PROGRESS" : s.state === "rejected" ? "BLOCKED" : "WAITING"}
            </div>
            {s.by ? <div style={{ fontSize: 11, color: VAR.mute, marginTop: 6 }}>by {s.by}</div> : null}
            {s.when ? <div className="mono" style={{ fontSize: 10.5, color: VAR.mute, marginTop: 2 }}>{new Date(s.when).toLocaleString()}</div> : null}
            {s.decision ? <div style={{ fontSize: 11.5, color: VAR.slate, marginTop: 6 }}>{s.decision}</div> : null}
            {s.signatureRef ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontSize: 9.5, fontWeight: 600, color: VAR.mute, letterSpacing: "0.05em" }}>SIG REF</div>
                <span className="mono" style={{ fontSize: 10, color: VAR.slate }}>{s.signatureRef.slice(0, 12)}…</span>
              </div>
            ) : null}
            {s.comments ? <div style={{ fontSize: 11, color: VAR.mute, marginTop: 6, fontStyle: "italic" }}>“{s.comments}”</div> : null}
          </div>
          {i < steps.length - 1 ? (
            <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 10, color: s.state === "done" ? VAR.green : VAR.border }}>
              <svg width="16" height="14" viewBox="0 0 16 14" fill="none"><path d="M1 7h12m0 0-4-4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" /></svg>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export interface ReleaseTrainStep {
  name: string;
  state: "done" | "active" | "rejected" | "pending";
  by?: string;
  when?: string;
  decision?: string;
  signatureRef?: string;
  comments?: string;
}

/** Approval timeline list (used in release detail + approval queue). */
export function ApprovalTimeline({ events }: { events: Array<{ title: string; when: string; body: ReactNode; tone?: keyof typeof TONE_FG }> }) {
  return (
    <div>
      {events.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 12, position: "relative", paddingBottom: 16 }}>
          {i < events.length - 1 ? (
            <div style={{ position: "absolute", left: 4.5, top: 14, bottom: 0, width: 1, background: VAR.border }} />
          ) : null}
          <div style={{ width: 10, height: 10, borderRadius: 1, background: e.tone ? TONE_FG[e.tone] : VAR.blue, marginTop: 4, flexShrink: 0, position: "relative", zIndex: 1 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: VAR.navy }}>{e.title}</div>
              <div className="mono" style={{ fontSize: 11, color: VAR.mute, whiteSpace: "nowrap" }}>
                {new Date(e.when).toLocaleString()}
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: VAR.slate, marginTop: 3 }}>{e.body}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dense operational data table with pinned headers. */
export function DataTable({ columns, rows, minWidth = 720 }: {
  columns: Array<{ key: string; label: string; width?: string; mono?: boolean }>;
  rows: Array<Record<string, ReactNode>>;
  minWidth?: number;
}) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", minWidth, borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} style={{
                textAlign: "left", padding: "9px 12px", fontSize: 11, fontWeight: 600,
                letterSpacing: "0.06em", textTransform: "uppercase", color: VAR.mute,
                borderBottom: `1px solid ${VAR.border}`, whiteSpace: "nowrap", width: c.width,
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${VAR.border}` }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "10px 12px", verticalAlign: "middle", color: VAR.text, fontFamily: c.mono ? "var(--font-mono)" : undefined, fontSize: c.mono ? 12 : 13 }}>
                  {r[c.key]}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} style={{ padding: 24, color: VAR.mute, textAlign: "center" }}>No records.</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

/** Framed pipeline card (canary/rollout stage). */
export function PipelineCard({ title, state, meta }: { title: string; state: string; meta?: ReactNode }) {
  const tone = toneFor(state);
  return (
    <Panel pad={0} style={{ overflow: "hidden" }}>
      <div style={{ padding: "10px 14px", background: TONE_BG[tone], borderBottom: `1px solid ${TONE_BG[tone] === "#ECF0F2" ? VAR.border : TONE_BG[tone]}` }}>
        <StatusPill status={state} small />
      </div>
      <div style={{ padding: 14 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: VAR.navy, fontFamily: "var(--font-mono)" }}>{title}</div>
        {meta ? <div style={{ fontSize: 12, color: VAR.slate, marginTop: 6 }}>{meta}</div> : null}
      </div>
    </Panel>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <Panel style={{ textAlign: "center", padding: 42 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: VAR.navy }}>{title}</div>
      <div style={{ fontSize: 13, color: VAR.mute, margin: "6px auto 16px", maxWidth: 420 }}>{body}</div>
      {action}
    </Panel>
  );
}

/** BOT Chain footer (genuine logo, links to official site). */
export function BotFooterBand() {
  return (
    <div style={{ background: VAR.navy, color: "#B7C3CD", marginTop: 60 }}>
      <div className="container" style={{ padding: "26px 28px", display: "flex", gap: 24, alignItems: "center", flexWrap: "wrap", fontSize: 13 }}>
        <a href="https://www.botchain.ai/en/" target="_blank" rel="noreferrer" title="BOT Chain — official website" style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/botchain-logo.svg" alt="BOT Chain" height={30} style={{ display: "block" }} />
        </a>
        <span style={{ color: "#8FA1B0", fontSize: 12 }}>Built on BOT Chain (Bohr). Learn more at the official site.</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11.5, color: "#8FA1B0" }}>Chain 677 mainnet · 968 testnet</span>
        <a href="https://scan.botchain.ai/" target="_blank" rel="noreferrer" style={{ color: "#9CC2DE", fontSize: 13 }}>BOT Chain Explorer ↗</a>
      </div>
    </div>
  );
}
