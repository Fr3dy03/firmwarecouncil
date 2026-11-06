import type { Metadata } from "next";
import { Panel, SectionHeading, Button } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "For hardware manufacturers",
  description:
    "Why hardware manufacturers care about FirmwareCouncil: propose releases through a governed wizard, sign without holding chain keys, and prove provenance to customers and auditors.",
};

export default function HardwareManufacturersPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Who it's for · hardware manufacturers"
        title="Propose releases. Prove who signed them."
        sub="Your firmware travels to devices you no longer control. FirmwareCouncil gives you a governed path from build to authorised rollout — and an on-chain record you can show your customers."
      />

      <section className="section-pad">
        <div className="container">
          <div className="grid-2">
            {[
              {
                t: "Propose releases through a governed wizard",
                d: "Register a product line once — hardware revisions, architecture, bootloader requirements, compatibility policy. Then propose releases against it: version, build identifier, target revisions, sha256 artifact digest and the external URL where your artifact already lives. Nothing is uploaded to us.",
              },
              {
                t: "Sign without holding chain keys",
                d: "You sign manifests and decisions with your own Ed25519 keys in your own environment — the private key never leaves. Where EIP-712 signing is used for approvals, the typed payload binds releaseId, role, decision and nonce; you sign with the key you control, and the contract verifies it without ever seeing the key.",
              },
              {
                t: "Prove provenance on demand",
                d: "The release trail — manifest digest, manufacturer signature, security approval, operator authorisation, deployment decisions — is hash-chained in the audit log and mirrored to ReleaseGovernance.sol on BOT Chain. Give a customer, auditor or insurer the references; they can verify independently.",
              },
              {
                t: "Wrong-key protection",
                d: "Keys are scoped to product lines, rotated with lineage, and revocable. The server re-verifies signatures against key state and scope on every decision — a revoked or out-of-scope key blocks verification, and devices reject releases signed by revoked keys.",
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
            eyebrow="What leaves your organisation"
            title="Metadata only — never your firmware."
          />
          <div className="grid-3">
            {[
              { t: "Stays with you", items: ["Firmware binaries and artifact hosting", "Ed25519 private signing keys (HSM or workstation)", "CI pipelines and build tooling"] },
              { t: "Registered in FirmwareCouncil", items: ["Release manifest (version, revisions, compatibility, security notes)", "sha256 artifact digest (recomputed server-side)", "External artifact URL on your own storage"] },
              { t: "Mirrored on BOT Chain", items: ["Decision trail and state hashes per release", "Release version uniqueness (keccak digest set)", "Signer registration and revocation"] },
            ].map((c) => (
              <Panel key={c.t} pad={22}>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)", marginBottom: 12 }}>
                  {c.t}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {c.items.map((i) => (
                    <li key={i} style={{ fontSize: 13.5, color: "var(--fc-slate)", padding: "8px 0", borderTop: "1px solid var(--fc-border)" }}>
                      {i}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button href="/sign-in">Sign in as the demo manufacturer</Button>
            <Button href="/release-governance" variant="secondary">Read the release train</Button>
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--fc-text-2)" }}>
            Demo manufacturer account: <span className="mono" style={{ fontSize: 12 }}>dev@ardane.example</span> — seeded on the sign-in page.
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
