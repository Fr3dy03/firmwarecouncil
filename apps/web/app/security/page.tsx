import type { Metadata } from "next";
import { Panel, SectionHeading, Button } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "Security",
  description:
    "FirmwareCouncil threat model: multi-party approval, forged-approval defense via signature digests, revocation propagation to devices, fail-closed receipt verification and on-chain access-control roles.",
};

const THREATS: Array<{ asset: string; actor: string; defense: string }> = [
  {
    asset: "Manufacturer signing key (stolen)",
    actor: "Compromised manufacturer HSM or workstation",
    defense:
      "Multi-party approval: a stolen manufacturer key alone cannot authorise rollout. The security reviewer and the fleet operator must approve from their own organisations — two roles in a single organisation are explicitly not counted.",
  },
  {
    asset: "Forged approval record",
    actor: "Malicious insider on the governance backend",
    defense:
      "Every decision must carry a signature digest: sha256 over the signed decision payload, with EIP-712 nonces tracked per signer and the digest bound to releaseId, role and decision. The same digest is mirrored on BOT Chain and can be verified against a wallet's own logs.",
  },
  {
    asset: "Firmware binary or artifact URL",
    actor: "Tampered artifact in the OTA repository",
    defense:
      "FirmwareCouncil never stores firmware — only sha256 digests, external URLs and metadata. The manifest schema is strict (no additional fields), URL hosts are allow-listed (localhost and metadata endpoints denied), and an already-registered digest is refused for a different release on the same product line.",
  },
  {
    asset: "Revoked signing key",
    actor: "Continued use of a rotated or revoked key",
    defense:
      "Keys have a first-class lifecycle (ACTIVE → ROTATING → REVOKED / EXPIRED). Devices verify against the signed key manifest and must reject a release signed by a revoked key; the reference device agent asserts this and refuses the install.",
  },
  {
    asset: "Device receipt stream",
    actor: "Inflated rollout progress / forged receipts",
    defense:
      "Receipts are verified by signature before they count: each receipt carries the device's Ed25519 signature, version, digest and outcome, and verification is fail-closed — an unverifiable receipt does not advance a rollout stage. Batches are committed as Merkle roots on-chain to keep gas low at fleet scale.",
  },
  {
    asset: "Rollback / freeze attack",
    actor: "Downgrade of a fleet to older vulnerable firmware",
    defense:
      "Devices pin lastVerifiedVersion and refuse downgrades below it (Uptane-style rollback defense). Only approved releases reach the OTA adapter's deployment plan; adapters cannot create deployments for PROPOSED or CHANGES_REQUESTED releases.",
  },
];

export default function SecurityPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Security model"
        title="Governance is a control, and we publish how it holds."
        sub="FirmwareCouncil is not a delivery channel and does not weaken your existing OTA signature verification. It adds third-party authorisation context and keeps tamper-evident evidence of every decision."
      />

      {/* ---------------- posture ---------------- */}
      <section className="section-pad">
        <div className="container">
          <Panel pad={24} style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 380px" }}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 10 }}>
                Posture: governance layer, not an OTA provider
              </div>
              <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>
                FirmwareCouncil never touches firmware payloads. Its device-side
                counterpart — the reference agent in <span className="mono" style={{ fontSize: 12.5 }}>packages/device-sim</span> —
                sits on top of, never instead of, an Uptane/TUF-compliant updater. OTA
                adapters push only authorisation context (version, digest, scope) into
                the existing deployment flow. If FirmwareCouncil is offline, your OTA
                platform still works; what stops is the governance gate.
              </p>
            </div>
          </Panel>
        </div>
      </section>

      {/* ---------------- threat table ---------------- */}
      <section className="section-pad" style={{ background: "var(--fc-surface)", borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="Threat model highlights"
            title="Assets, actors and the specific defense."
            sub="Distilled from the security model document that ships with the repository; the full contract with test assertions is in SECURITY_MODEL.md and the security test runbook."
          />
          <div style={{ display: "grid", gap: 18 }}>
            {THREATS.map((t) => (
              <Panel key={t.asset} pad={22}>
                <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 240px" }}>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 4 }}>{t.asset}</div>
                    <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Actor: {t.actor}</div>
                  </div>
                  <div style={{ flex: "2 1 420px" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-green)", marginBottom: 6 }}>
                      Defense
                    </div>
                    <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>{t.defense}</p>
                  </div>
                </div>
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- TUF checklist ---------------- */}
      <section className="section-pad">
        <div className="container">
          <SectionHeading
            eyebrow="Reference checklist"
            title="Measured against Uptane/TUF properties."
            sub="Not a reimplementation of Uptane — a governance layer whose contract is consistent with its key-defense properties."
          />
          <div className="grid-3">
            {[
              { t: "Replay / freeze defense", d: "EIP-712 nonces; snapshot timestamp plus freshness window in the device manifest fetch." },
              { t: "Rollback defense", d: "Devices pin lastVerifiedVersion and refuse downgrades; the backend refuses digest reuse across releases." },
              { t: "Key compromise resilience", d: "Multi-party quorum across organisations; separately rotatable signing keys with recorded lineage." },
              { t: "Key revocation", d: "First-class revoked state on the signing-key registry plus on-chain revokeSigner." },
              { t: "Weak upgrade authorisation", d: "Only approved releases appear in an OTA adapter's deployment plan, and pause/revoke push out immediately." },
              { t: "Consistency", d: "Append-only, hash-chained audit log; re-verified for chain integrity on read." },
            ].map((c) => (
              <Panel key={c.t} pad={22}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 8 }}>{c.t}</div>
                <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>{c.d}</p>
              </Panel>
            ))}
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button href="/release-governance" variant="secondary">Release governance deep dive</Button>
            <Button href="/faq">Read the FAQ</Button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
