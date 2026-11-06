import type { Metadata } from "next";
import { Panel, PanelTitle, SectionHeading, Button } from "../../components/fc/ui";
import { SiteShell, PageHero, VerificationPill } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "Integrations",
  description:
    "How FirmwareCouncil connects to OTA platforms: functional simulator adapter today; Mender, hawkBit and balena drivers implemented against documented endpoint shapes and explicitly marked unverified.",
};

const ADAPTERS: Array<{
  name: string;
  role: string;
  detail: string[];
  verified: boolean;
}> = [
  {
    name: "Device simulator",
    role: "Functional today (local demo)",
    detail: [
      "Full local fleet model that powers the demo and end-to-end tests.",
      "Devices read release metadata, verify the manufacturer signature chain, check compatibility (product line + hardware revision) and revocation state.",
      "Install only inside the device's CANARY / ROLLOUT / DEPLOYED eligibility window, then submit Ed25519-signed receipts with outcome, version, digest and timestamps.",
      "Handles offline windows with retry/backoff and records permanent failures into the incident pipeline.",
    ],
    verified: true,
  },
  {
    name: "Mender",
    role: "Implemented against the Management API — not yet verified",
    detail: [
      "Maps FirmwareCouncil rollout stages to Mender phase/group deployment targeting, device groups, deployment reports and install outcomes.",
      "FirmwareCouncil never uploads artifacts: a Release here references an existing Mender artifact name and the binary URL in your own storage.",
      "Authentication follows the documented Management API model (JWT / personal access tokens); device-auth endpoints would use per-device JWTs — tokens must live in a vault, not in the database.",
      "Not yet verified — sandbox testing required: the driver implements the documented endpoint shapes but has not been exercised with real tenant credentials.",
    ],
    verified: false,
  },
  {
    name: "Eclipse hawkBit",
    role: "Implemented against DDI/Mgmt rollout semantics — not yet verified",
    detail: [
      "Maps staged rollout windows onto hawkBit rollout groups (statusCreating · statusReady · statusRunning · statusPaused · statusStopping · statusFinished).",
      "Uses pause/stop for incidents, matching FirmwareCouncil's staged rollout semantics.",
      "Not yet verified — sandbox testing required.",
    ],
    verified: false,
  },
  {
    name: "balena",
    role: "Implemented against fleet/release semantics — not yet verified",
    detail: [
      "Maps the fleet-and-release model: fleets pinned to a release, release freeze to prevent movement, preemptively blocked releases and final releases.",
      "Correlates cleanly to FirmwareCouncil supersede and rollback-authorise semantics; the deployment-creation path differs by design and remains unimplemented.",
      "Not yet verified — sandbox testing required.",
    ],
    verified: false,
  },
];

export default function IntegrationsPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Integrations"
        title="Your OTA platform ships updates. We govern them."
        sub="FirmwareCouncil is deliberately not an OTA provider. Adapters connect the governance layer to the platform that does delivery — with an honest, explicit verification status for each."
      />

      {/* ---------------- hard rules ---------------- */}
      <section className="section-pad">
        <div className="container">
          <Panel pad={24}>
            <PanelTitle>Hard rules, enforced for every adapter</PanelTitle>
            <div style={{ display: "grid", gap: 10, fontSize: 13.5, color: "var(--fc-slate)" }}>
              {[
                "Firmware binaries never flow through FirmwareCouncil — only digests, URLs and metadata.",
                "Adapters never create deployments for releases that have not passed the security and operator approval gates.",
                "Pause and revoke are pushed to adapters immediately; deployment creation is refused while an incident is open.",
                "No adapter is presented as functional before actual credentials and sandbox testing are complete — mis-scoped claims are tracked, never marketed.",
              ].map((r) => (
                <div key={r} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--fc-border)" }}>
                  <span style={{ color: "var(--fc-blue)", fontWeight: 600 }}>›</span>
                  {r}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      {/* ---------------- adapter status ---------------- */}
      <section className="section-pad" style={{ background: "var(--fc-surface)", borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="Adapter registry"
            title="Verification status, stated plainly."
            sub="Each adapter implements the same OTAAdapter contract: inventory, deployment creation, deployment status, installation outcomes and abort. Credentials are stored as references only — secret material stays in your vault or environment."
          />
          <div className="grid-2">
            {ADAPTERS.map((a) => (
              <Panel key={a.name} pad={22}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span className="mono" style={{ fontSize: 14.5, fontWeight: 600, color: "var(--fc-navy)" }}>{a.name}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>{a.role}</div>
                  </div>
                  <VerificationPill verified={a.verified} />
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {a.detail.map((d) => (
                    <li key={d.slice(0, 28)} style={{ fontSize: 13, color: "var(--fc-slate)", padding: "8px 0", borderTop: "1px solid var(--fc-border)" }}>
                      {d}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
          <Panel pad={20} style={{ marginTop: 28 }}>
            <div style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>
              <span style={{ fontWeight: 600, color: "var(--fc-navy)" }}>What "unverified" means in production terms:</span>{" "}
              in the product, unverified adapters surface a yellow badge and refuse to be
              promoted to verified until real sandbox credentials have exercised every
              call path. You can register an integration and run its connectivity check
              (<span className="mono" style={{ fontSize: 12.5 }}>POST /api/v1/integrations/:id/verify</span>) against your own instance.
            </div>
          </Panel>
        </div>
      </section>

      <section className="section-pad">
        <div className="container" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button href="/sign-in">See the simulator adapter live</Button>
          <Button href="/documentation" variant="secondary">Integration documentation</Button>
          <Button href="/contact" variant="ghost">Talk to us about a pilot</Button>
        </div>
      </section>
    </SiteShell>
  );
}
