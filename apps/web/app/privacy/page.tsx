import type { Metadata } from "next";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What data FirmwareCouncil holds, why it holds it, and what it never touches.",
};

const S = {
  h: { fontSize: 18, color: "var(--fc-navy)", margin: "36px 0 12px" } as React.CSSProperties,
  h2: { fontSize: 15, color: "var(--fc-navy)", margin: "24px 0 8px" } as React.CSSProperties,
  p: { fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 10, lineHeight: 1.7 } as React.CSSProperties,
  li: { fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 6, lineHeight: 1.7 } as React.CSSProperties,
};

export default function PrivacyPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Legal"
        title="Privacy"
        sub="FirmwareCouncil is a governance and audit system, so this policy is grounded in what the data model actually contains — and what it deliberately does not."
      />
      <section className="section-pad">
        <div className="container" style={{ maxWidth: 860 }}>
          <h2 style={S.h}>1. What we store</h2>
          <p style={S.p}>
            The platform's persistence layer holds the entities required to govern a
            release train:
          </p>
          <ul style={{ paddingLeft: 18, marginBottom: 14 }}>
            <li style={S.li}><b>Organisations and users</b> — organisation name and type, and for each member an email address, name, organisational role and a password hash (scrypt; plaintext passwords are never stored).</li>
            <li style={S.li}><b>Governance records</b> — product lines, hardware revisions, releases, release manifests (version, build identifier, target revisions, sha256 artifact digest, artifact size, external artifact URL, compatibility and security notes), release approvals, rollout policies and stages.</li>
            <li style={S.li}><b>Operational records</b> — device fleets and devices (references, hardware revision, status, versions), installation receipts (outcome, version, digest, device signature), incidents and incident comments.</li>
            <li style={S.li}><b>Signatures and keys</b> — Ed25519 <i>public</i> keys only, with fingerprint, product scope and lifecycle state. Private signing key material is never transmitted to or stored by the platform.</li>
            <li style={S.li}><b>Audit and chain records</b> — append-only audit events (actor, organisation, kind, entity, detail, hash chain) and blockchain transaction metadata (kind, chain ID, hash, status).</li>
            <li style={S.li}><b>OTA integrations</b> — provider, base URL and a credential <i>reference</i>. Secret material lives in your vault or environment, not in the database.</li>
          </ul>

          <h2 style={S.h}>2. What we never hold</h2>
          <ul style={{ paddingLeft: 18, marginBottom: 14 }}>
            <li style={S.li}>Firmware binaries — only digests and URLs pointing to storage you control.</li>
            <li style={S.li}>Private cryptographic keys of any participant.</li>
            <li style={S.li}>OTA platform credentials in the clear (references only).</li>
          </ul>

          <h2 style={S.h}>3. Audit records are content-addressed</h2>
          <p style={S.p}>
            Audit events carry a sequence number and a hash that covers the event and the
            previous event's hash. They exist to prove what happened and when; correcting
            a factual error in a person's record does not rewrite history unseen — it is
            appended as a new event, and the chain records the amendment.
          </p>

          <h2 style={S.h}>4. No sale of data</h2>
          <p style={S.p}>
            We do not sell, rent or trade your data. There is no advertising or
            third-party behavioural tracking in the product.
          </p>

          <h2 style={S.h}>5. On-chain data</h2>
          <p style={S.p}>
            Governance decisions and state hashes are mirrored to BOT Chain
            (testnet 968 / mainnet 677) to make them independently verifiable. On-chain
            records are public and immutable by design; only digests and decision
            metadata are written, never firmware, manifests in full, or personal contact
            details.
          </p>

          <h2 style={S.h}>6. Sessions and security</h2>
          <p style={S.p}>
            Sessions are bearer tokens with a server-side revocation list; password
            hashing uses scrypt; audit chains are re-verified on read. In demo
            deployments, seeded accounts exist and a production deployment must remove
            them (<span className="mono" style={{ fontSize: 12.5 }}>SEED_DEMO=false</span>).
          </p>

          <h2 style={S.h}>7. Retention and export</h2>
          <p style={S.p}>
            Governance records are retained for the lifetime of the audit obligation you
            configure. As an customer on a self-hosted deployment, all data resides in
            your infrastructure and remains exportable to you.
          </p>

          <p style={{ ...S.p, color: "var(--fc-text-2)", marginTop: 24 }}>
            Questions about this policy: <span className="mono" style={{ fontSize: 12.5 }}>privacy@firmwarecouncil.example</span>.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
