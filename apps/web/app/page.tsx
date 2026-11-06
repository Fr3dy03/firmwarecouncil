import type { Metadata } from "next";
import Link from "next/link";
import {
  Panel, PanelTitle, SectionHeading, Button, StatusPill, MonoRef, ReleaseTrain,
  type ReleaseTrainStep,
} from "../components/fc/ui";
import { SiteShell, VerificationPill } from "../components/fc/site";

export const metadata: Metadata = {
  title: "Multi-party firmware release governance",
  description:
    "FirmwareCouncil coordinates multi-party firmware release approval, staged rollout and auditable rollback across organisations — on top of your existing OTA platform, built on BOT Chain.",
};

const TRAIN_STEPS: ReleaseTrainStep[] = [
  {
    name: "PROPOSED", state: "done", by: "Ardane Hardware (manufacturer)",
    when: "2026-11-03T09:14:00Z", decision: "release proposed by manufacturer",
  },
  {
    name: "SECURITY REVIEW", state: "done", by: "Sentinel Security (reviewer)",
    when: "2026-11-03T15:42:00Z", decision: "APPROVE — no issues in threat review",
    signatureRef: "9f2c41ab8d03e77fba01c5d9",
  },
  {
    name: "OPERATOR APPROVAL", state: "done", by: "Voltridge Ops (fleet operator)",
    when: "2026-11-04T08:05:00Z", decision: "APPROVE — canary cohort approved",
    signatureRef: "41be9d2c07aa5f83c6e1b447",
  },
  {
    name: "CANARY", state: "active", when: "2026-11-05T10:30:00Z",
    decision: "5-device cohort · 4 receipts verified, 0 failures",
  },
  { name: "ROLLOUT", state: "pending" },
  { name: "DEPLOYED", state: "pending" },
];

const FEATURES = [
  {
    title: "Multi-party decisions",
    body:
      "A firmware release moves only when the required parties sign off: the manufacturer proposes, the security reviewer approves, the fleet operator authorises rollout. Approvals must come from different organisations when policy requires it — two roles inside one organisation do not count.",
    points: ["Release states gate who can act", "Cross-organisation quorum by default", "No single actor can authorise a rollout"],
  },
  {
    title: "Signed evidence",
    body:
      "Every decision carries a sha256 signature digest over the signed decision payload, bound to the release, the signer's role and a nonce. The manifest digest is recomputed server-side, and the whole trail is recorded on BOT Chain for independent verification.",
    points: ["EIP-712 typed signing, replay-protected", "Signature digests stored with every approval", "Append-only, hash-chained audit events"],
  },
  {
    title: "Staged deployment with rollback",
    body:
      "Rollouts are defined as explicit stages — canary first, then widening cohorts — with dwell windows and automatic halt thresholds. Opening an incident pauses the rollout, and rollback is recorded as a first-class signed decision.",
    points: ["Canary cohort with manual/auto advance", "Pause and revoke propagate to OTA adapters", "Rollback target recorded and signed"],
  },
];

function CtaSection() {
  return (
    <section className="section-pad" style={{ borderTop: "1px solid var(--fc-border)" }}>
      <div className="container" style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 420px" }}>
          <SectionHeading
            eyebrow="See it for yourself"
            title="Sign in and walk a real release train."
            sub="The demo control room ships with seeded organisations — a manufacturer, a security reviewer and a fleet operator — so you can propose, approve, canary and deploy a release end to end."
          />
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button href="/sign-in">Open control room</Button>
          <Button href="/documentation" variant="secondary">Read the documentation</Button>
          <Button href="/faq" variant="ghost">Common questions</Button>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <SiteShell>
      {/* ---------------- hero ---------------- */}
      <section style={{ background: "var(--fc-surface)", borderBottom: "1px solid var(--fc-border)" }}>
        <div className="container" style={{ padding: "84px 28px 64px" }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            Firmware release governance · built on BOT Chain
          </div>
          <h1
            style={{
              fontSize: "clamp(2.2rem, 4.6vw, 3.4rem)", color: "var(--fc-navy)",
              lineHeight: 1.08, maxWidth: 860, marginBottom: 18,
            }}
          >
            Software releases need more than a signature.
          </h1>
          <p
            style={{
              color: "var(--fc-text-2)", fontSize: 17.5, maxWidth: 700,
              marginBottom: 30, lineHeight: 1.6,
            }}
          >
            FirmwareCouncil is a governance layer where the manufacturer, the security
            reviewer and the fleet operator each sign the release decision — before the
            canary opens, during staged rollout, and when a rollback has to be
            authorised. Every one of those signatures is hashed into an audit chain you
            can hand to a customer, an auditor or a regulator.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button href="/sign-in">Open control room</Button>
            <Button href="/documentation" variant="secondary">Read the documentation</Button>
          </div>
        </div>
      </section>

      {/* --------- non-decorative product visual: the release train --------- */}
      <section className="section-pad">
        <div className="container">
          <Panel pad={24}>
            <PanelTitle
              right={<StatusPill status="CANARY_RUNNING" />}
            >
              Release train — VLT-7 controller, v2.4.1
            </PanelTitle>
            <div
              style={{
                display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12.5,
                color: "var(--fc-text-2)", marginBottom: 18,
              }}
            >
              <span>Firmware digest: <MonoRef value="b391c5f6e02a887d4f1a9c30d20e7b86f4aa3c11" max={18} /></span>
              <span>Manifest digest: <MonoRef value="7d44c901aa63f28b504de1187cfb3e29" max={18} /></span>
              <span>Manufacturer signature on file</span>
            </div>
            <ReleaseTrain steps={TRAIN_STEPS} />
            <div style={{ marginTop: 18, fontSize: 12, color: "var(--fc-text-2)" }}>
              Static illustration of the governed pipeline. In the live control room,
              the same train is driven by real approvals — each decision step above
              carries the signer, timestamp and sha256 signature digest recorded for it.
            </div>
          </Panel>
        </div>
      </section>

      {/* ---------------- three feature panels ---------------- */}
      <section className="section-pad" style={{ borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="What it does"
            title="Decisions about firmware, not the firmware itself."
            sub="FirmwareCouncil never hosts or uploads artifacts. It governs which firmware may be rolled out — and keeps the evidence."
          />
          <div className="grid-3">
            {FEATURES.map((f) => (
              <Panel key={f.title} pad={22}>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 10 }}>
                  {f.title}
                </div>
                <p style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 14 }}>
                  {f.body}
                </p>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {f.points.map((pt) => (
                    <li
                      key={pt}
                      style={{
                        fontSize: 12.5, color: "var(--fc-text-2)", padding: "6px 0",
                        borderTop: "1px solid var(--fc-border)", display: "flex", gap: 8,
                      }}
                    >
                      <span style={{ color: "var(--fc-blue)", fontWeight: 600 }}>›</span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="section-pad" style={{ background: "var(--fc-surface)", borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="How it works"
            title="Four steps, aligned to the governance flow."
            sub="The same lifecycle the ReleaseGovernance contract mirrors on BOT Chain."
          />
          <div className="grid-2">
            {[
              {
                n: "01", t: "Propose",
                d: "The manufacturer proposes a release against a product line: version, target hardware revisions, sha256 artifact digest and an external artifact URL. The manifest is validated server-side — strict schema, digest uniqueness — before any reviewer sees it. The manufacturer signs the manifest; the private key never leaves their environment.",
              },
              {
                n: "02", t: "Review and approve",
                d: "The security reviewer approves, rejects or requests changes with a signed decision. Once security clears it, the fleet operator separately authorises the rollout — from a different organisation where policy requires it. Both decisions carry a mandatory sha256 signature digest.",
              },
              {
                n: "03", t: "Canary and staged rollout",
                d: "Devices verify the signature chain, compatibility and revocation state before installing, then submit signed receipts. Canary outcomes gate every widening stage; a failure threshold halts the rollout automatically and can open an incident.",
              },
              {
                n: "04", t: "Deployed and audit-chained",
                d: "Completion, pauses, revocations and rollbacks are all decisions too. Every transition is appended to a hash-chained audit log and mirrored to ReleaseGovernance.sol on BOT Chain, keyed by release and product line.",
              },
            ].map((s) => (
              <Panel key={s.n} pad={22}>
                <div style={{ display: "flex", gap: 16 }}>
                  <div
                    className="mono"
                    style={{ fontSize: 20, fontWeight: 600, color: "var(--fc-blue)", lineHeight: 1 }}
                  >
                    {s.n}
                  </div>
                  <div>
                    <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 8 }}>
                      {s.t}
                    </div>
                    <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>{s.d}</p>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- works with your OTA platform ---------------- */}
      <section className="section-pad" style={{ borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="Honest status"
            title="Works with your OTA platform."
            sub="FirmwareCouncil does not replace the system that ships updates to devices — it decides what that system is allowed to ship. Binaries stay in your artifact repository; we register digests, URLs and authorisation context only."
          />
          <Panel pad={0}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 640, borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr>
                    {["Platform", "Role in the rollout", "Adapter status"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left", padding: "12px 18px", fontSize: 11, fontWeight: 600,
                          letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)",
                          borderBottom: "1px solid var(--fc-border)",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      name: "Device simulator",
                      role: "Full local fleet model — powers the demo and end-to-end tests",
                      verified: true,
                    },
                    {
                      name: "Mender",
                      role: "Inventory, deployment references, install outcomes via the Management API",
                      verified: false,
                    },
                    {
                      name: "Eclipse hawkBit",
                      role: "Rollout group mapping, DDI status, pause/stop on incidents",
                      verified: false,
                    },
                    {
                      name: "balena",
                      role: "Fleet/release freeze and preempt mapping",
                      verified: false,
                    },
                  ].map((r) => (
                    <tr key={r.name} style={{ borderBottom: "1px solid var(--fc-border)" }}>
                      <td style={{ padding: "14px 18px", fontWeight: 600, color: "var(--fc-navy)" }}>{r.name}</td>
                      <td style={{ padding: "14px 18px", color: "var(--fc-slate)" }}>{r.role}</td>
                      <td style={{ padding: "14px 18px" }}><VerificationPill verified={r.verified} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: "14px 18px", fontSize: 12.5, color: "var(--fc-text-2)" }}>
              Only the simulator adapter is verified today. Mender, hawkBit and balena
              drivers implement the documented endpoint shapes but are not marketed as
              functional until they have been smoke-tested with real sandbox
              credentials (see <Link href="/integrations">integrations</Link>).
            </div>
          </Panel>
          <div style={{ marginTop: 28, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button href="/sign-in">Open control room</Button>
            <Button href="/documentation" variant="secondary">Read the documentation</Button>
          </div>
        </div>
      </section>

      <CtaSection />
    </SiteShell>
  );
}
