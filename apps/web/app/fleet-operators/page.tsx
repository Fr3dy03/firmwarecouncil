import type { Metadata } from "next";
import { Panel, SectionHeading, Button, StatusPill } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "For fleet operators",
  description:
    "Why fleet operators care about FirmwareCouncil: control what ships to your fleets, staged rollout with dwell windows, incident response with automatic halts, and signed rollback authorisation.",
};

export default function FleetOperatorsPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Who it's for · fleet operators"
        title="Your fleet, your authorisation."
        sub="As the organisation that owns the devices, you are the last gate between a manufacturer's firmware and a rollout to production fleets. FirmwareCouncil makes that gate explicit, signed and reversible."
      />

      <section className="section-pad">
        <div className="container">
          <div className="grid-2">
            {[
              {
                t: "Control what ships to your fleets",
                d: "No release reaches a deployment plan on your OTA platform until you have separately authorised it — even when the security reviewer already approved. You decide which cohorts are eligible and when.",
              },
              {
                t: "Staged rollout, on your terms",
                d: "Define canary cohorts and widen in stages (CANARY · SMALL · MEDIUM · LARGE · FULL) with dwell windows and auto-halt failure thresholds. Advance manually when you are satisfied, or let the stage advance once receipts check out.",
              },
              {
                t: "Incident response that actually stops things",
                d: "Open an incident and the rollout pauses; pause and revoke are pushed to the connected OTA adapter within a bounded window, and new deployment creation is refused while the incident is open.",
              },
              {
                t: "Rollback with a paper trail",
                d: "Rollback is a first-class signed decision carrying the target version and approval references — not a side conversation. Afterwards, the whole sequence (deploy, incident, pause, rollback) is one hash-chained audit record.",
              },
            ].map((c) => (
              <Panel key={c.t} pad={24}>
                <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 10 }}>{c.t}</div>
                <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>{c.d}</p>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      <section className="section-pad" style={{ background: "var(--fc-surface)", borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="Your day in the control room"
            title="What the operator role sees."
            sub="Sessions are scoped to one governance identity at a time — everything you do is attributed to your organisation."
          />
          <div className="grid-2">
            <Panel pad={0}>
              <div style={{ padding: 18, borderBottom: "1px solid var(--fc-border)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)" }}>
                  Approvals queue — operator decisions pending
                </div>
              </div>
              {[
                { r: "VLT-7 controller v2.4.1 — Ardane Hardware", s: "SECURITY_APPROVED", w: "Awaiting your rollout authorisation" },
                { r: "SEN-2 gateway v2.0.0 — Nordholm Devices", s: "SECURITY_APPROVED", w: "Awaiting your rollout authorisation" },
              ].map((q) => (
                <div key={q.r} style={{ padding: "14px 18px", borderBottom: "1px solid var(--fc-border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 300px" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fc-navy)" }}>{q.r}</div>
                    <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>{q.w}</div>
                  </div>
                  <StatusPill status={q.s} />
                </div>
              ))}
            </Panel>
            <Panel pad={0}>
              <div style={{ padding: 18, borderBottom: "1px solid var(--fc-border)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)" }}>
                  Rollout state — what you can act on now
                </div>
              </div>
              {[
                { r: "SEN-2 gateway v1.9.0 — canary cohort (5 devices)", s: "CANARY_RUNNING", w: "4 receipts verified · dwell window open" },
                { r: "VLT-7 controller v2.3.8 — stage 3 of 5", s: "ROLLOUT_IN_PROGRESS", w: "Advance, pause or resume" },
                { r: "VLT-7 controller v2.3.5 — rollout halted", s: "PAUSED", w: "Incident INC-0042 open · resume, revoke or rollback" },
              ].map((q) => (
                <div key={q.r} style={{ padding: "14px 18px", borderBottom: "1px solid var(--fc-border)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 300px" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fc-navy)" }}>{q.r}</div>
                    <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>{q.w}</div>
                  </div>
                  <StatusPill status={q.s} />
                </div>
              ))}
            </Panel>
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button href="/sign-in">Sign in as the demo operator</Button>
            <Button href="/release-governance" variant="secondary">Read the release train</Button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--fc-text-2)" }}>
            Demo operator account: <span className="mono" style={{ fontSize: 12 }}>ops@voltridge.example</span> — seeded on the sign-in page.
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
