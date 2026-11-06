"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/api";
import { Button, Field, Panel, inputStyle } from "../../components/fc/ui";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.push("/app");
    } catch (e: any) {
      setError(e?.message ?? "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  const demo = [
    { role: "Manufacturer", email: "dev@ardane.example", password: "maker-demo-pass" },
    { role: "Security reviewer", email: "review@sentinel.example", password: "security-demo-pass" },
    { role: "Fleet operator", email: "ops@voltridge.example", password: "operator-demo-pass" },
    { role: "Platform admin", email: "admin@firmwarecouncil.example", password: "platform-demo-pass" },
  ];

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 28 }}>
      <div style={{ width: "100%", maxWidth: 880, display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 36, alignItems: "start" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 12 }}>FirmwareCouncil control room</div>
          <h1 style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.6rem)", color: "var(--fc-navy)", lineHeight: 1.15, marginBottom: 14 }}>
            Sign in to govern your release train
          </h1>
          <p style={{ color: "var(--fc-text-2)", fontSize: 15, marginBottom: 26 }}>
            Multi-party firmware release approval, canary oversight and staged deployment
            across your organisations. Every decision is signed and audit-chained.
          </p>
          <Panel pad={18}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)", marginBottom: 10 }}>
              Demonstration accounts
            </div>
            {demo.map((d) => (
              <div key={d.email} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "6px 0", borderBottom: "1px solid var(--fc-border)", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: "var(--fc-navy)", minWidth: 130 }}>{d.role}</span>
                <span className="mono" style={{ color: "var(--fc-slate)", fontSize: 12 }}>{d.email}</span>
                <span className="mono" style={{ color: "var(--fc-text-2)", fontSize: 11.5, marginLeft: "auto" }}>{d.password}</span>
              </div>
            ))}
            <div style={{ fontSize: 11.5, color: "var(--fc-text-2)", marginTop: 10 }}>
              Click a role to fill the form. Sessions are scoped to one governance identity at a time.
            </div>
          </Panel>
        </div>
        <Panel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <Field label="Work email">
              <input
                className="mono"
                style={inputStyle}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@organisation.example"
                autoFocus
              />
            </Field>
            <Field label="Password">
              <input style={inputStyle} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••••" />
            </Field>
            {error ? (
              <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13, marginBottom: 14 }}>
                {error}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              {demo.map((d) => (
                <Button key={d.email} variant="ghost" onClick={() => { setEmail(d.email); setPassword(d.password); }}>
                  {d.role.split(" ")[0]}
                </Button>
              ))}
            </div>
            <Button type="submit" full disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <div style={{ fontSize: 11.5, color: "var(--fc-text-2)", marginTop: 16 }}>
            Authenticated sessions are required for all governance decisions. Actions are attributed
            to your organisation and appended to the tamper-evident audit chain.
          </div>
        </Panel>
      </div>
    </main>
  );
}
