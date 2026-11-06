import type { Metadata } from "next";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Terms of use for FirmwareCouncil: what the platform is, what it is not, your responsibilities and the honest limits of the software.",
};

const S = {
  h: { fontSize: 18, color: "var(--fc-navy)", margin: "36px 0 12px" } as React.CSSProperties,
  p: { fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 10, lineHeight: 1.7 } as React.CSSProperties,
  li: { fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 6, lineHeight: 1.7 } as React.CSSProperties,
};

export default function TermsPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Legal"
        title="Terms of use"
        sub="Plain terms for a governance product: what FirmwareCouncil does, what it does not do, and what you remain responsible for."
      />
      <section className="section-pad">
        <div className="container" style={{ maxWidth: 860 }}>
          <h2 style={S.h}>1. What the service is</h2>
          <p style={S.p}>
            FirmwareCouncil is a governance and audit layer for multi-party firmware
            releases. It records, enforces and evidences decisions about which firmware
            may be rolled out to device fleets, and mirrors those decisions to the
            ReleaseGovernance contract on BOT Chain (testnet chain 968, mainnet chain 677).
          </p>

          <h2 style={S.h}>2. What the service is not</h2>
          <ul style={{ paddingLeft: 18, marginBottom: 14 }}>
            <li style={S.li}>It is not an OTA provider and does not host, upload or deliver firmware. Artifacts stay in your own storage and are delivered by your own OTA platform.</li>
            <li style={S.li}>It is not a replacement for a Uptane/TUF-compliant device update client; the device-side reference agent is an instrumentation harness that validates the integration contract.</li>
            <li style={S.li}>Verification of OTA adapters is explicit: only adapters that have passed sandbox testing with real credentials are presented as verified.</li>
          </ul>

          <h2 style={S.h}>3. Your responsibilities</h2>
          <ul style={{ paddingLeft: 18, marginBottom: 14 }}>
            <li style={S.li}>Protect your signing keys. Private keys never leave your environment and the platform cannot recover them.</li>
            <li style={S.li}>Use distinct organisations for distinct governance roles where your policy requires cross-organisation approval; the platform enforces what you configure.</li>
            <li style={S.li}>Disable seeded demo accounts in any real deployment (<span className="mono" style={{ fontSize: 12.5 }}>SEED_DEMO=false</span>).</li>
            <li style={S.li}>Secure the environment variables that hold OTA platform credentials.</li>
          </ul>

          <h2 style={S.h}>4. Audit records</h2>
          <p style={S.p}>
            Every state-changing action appends a hash-chained audit event; audit records
            are content-addressed and append-only by design. They constitute the record
            of decisions taken through the platform and may be relied upon as evidence of
            governance activity, within the verification state published for each
            component.
          </p>

          <h2 style={S.h}>5. Availability and the chain</h2>
          <p style={S.p}>
            Governance continues when BOT Chain is unavailable: chain transactions are
            recorded locally as announced, pending broadcast, and a reconciliation job
            re-verifies on-chain state by stored transaction receipt. The authoritative
            short-term source of truth for the user interface is the platform's own
            store; the chain mirror is eventually consistent and divergences are alerted.
          </p>

          <h2 style={S.h}>6. Demo and evaluation use</h2>
          <p style={S.p}>
            Demonstration deployments, including seeded organisations and accounts, are
            provided for evaluation. Decisions taken in a demo environment are not
            governance records for production fleets.
          </p>

          <h2 style={S.h}>7. Limitation of liability</h2>
          <p style={S.p}>
            To the maximum extent permitted by law, the software is provided "as is"
            under its repository licence, and the operator of a deployment is responsible
            for the fitness of that deployment for its regulatory environment. Firmware
            safety remains the responsibility of the firmware author, the reviewing
            organisations and the deploying operator — the platform evidences their
            decisions; it does not certify firmware.
          </p>

          <p style={{ ...S.p, color: "var(--fc-text-2)", marginTop: 24 }}>
            Questions about these terms: <span className="mono" style={{ fontSize: 12.5 }}>legal@firmwarecouncil.example</span>.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
