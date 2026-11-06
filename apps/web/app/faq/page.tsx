import type { Metadata } from "next";
import Link from "next/link";
import { Panel, Button } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "FirmwareCouncil frequently asked questions: is this an OTA provider, do you touch my firmware, what is BOT Chain, what happens when the chain is unavailable, who signs decisions, and what the honest limitations are.",
};

const QA: Array<{ q: string; a: React.ReactNode; id?: string }> = [
  {
    q: "Is FirmwareCouncil an OTA provider?",
    a: <>No. FirmwareCouncil is a governance and audit layer. It does not host devices, run deployment fleets or deliver updates. Your existing OTA platform — Mender, hawkBit, balena or the built-in device simulator — still performs delivery. FirmwareCouncil governs <i>which</i> firmware that platform is allowed to ship, and keeps the signed evidence of the decisions.</>,
  },
  {
    q: "Do you touch, store or upload my firmware?",
    a: <>No. Firmwares never flow through the platform. A release registers the sha256 artifact digest, an external URL pointing to your own artifact storage, and metadata (version, target hardware revisions, compatibility, security notes). The manifest is validated server-side, and digest reuse across releases on the same product line is refused.</>,
  },
  {
    q: "What is BOT Chain and why is this built on it?",
    a: <>BOT Chain (Bohr) is an Ethereum/Geth-compatible L1 — mainnet chain 677 (RPC <span className="mono" style={{ fontSize: 12.5 }}>https://rpc.botchain.ai</span>), testnet chain 968 (RPC <span className="mono" style={{ fontSize: 12.5 }}>https://rpc.bohr.life</span>). The ReleaseGovernance contract mirrors the decision trail and state hashes of each release on-chain, so the record can be verified independently of our backend. Full details in <Link href="/documentation#research">the research notes</Link>.</>,
  },
  {
    q: "What if BOT Chain is unavailable?",
    a: <>Governance never depends on a live chain write. When a chain transaction cannot be broadcast, it is recorded locally as <span className="mono" style={{ fontSize: 12.5 }}>ANNOUNCED</span> — staged, stored with its kind, related entity and chain ID, but honestly not yet on-chain. Approval decisions and state transitions still proceed off-chain while jobs retry with backoff. A reconciliation job re-reads chain state by stored transaction receipt and alerts on divergence, so the mirror is eventually consistent and the divergence is visible, never silent.</>,
  },
  {
    q: "Who signs the decisions?",
    a: <>Three different parties, in sequence: the <b>manufacturer</b> proposes and signs the manifest (Ed25519 over the canonical manifest digest); the <b>security reviewer</b> approves, rejects or requests changes; the <b>operator</b> separately authorises rollout. Each decision must carry a sha256 signature digest over the signed payload — the backend rejects a decision without one — and EIP-712 nonces prevent replay. Where policy requires it, approvals must come from different organisations.</>,
  },
  {
    q: "Can two people in the same organisation approve each other?",
    a: <>No, when the review policy requires cross-organisation approval (the default). Distinct roles inside a single organisation are explicitly not counted: the manufacturer organisation and the operator organisation, for example, must differ, and the security reviewer sits in its own organisation.</>,
  },
  {
    q: "What happens if a signing key is compromised?",
    a: <>Keys are rotated with recorded lineage or revoked outright. A revoked key blocks server-side verification immediately, and devices verify against the signed key manifest — the reference device agent refuses to install a release signed by a revoked key. Revocation is also mirrored on-chain (<span className="mono" style={{ fontSize: 12.5 }}>revokeSigner</span>). Because rollout requires multi-party approval, a stolen manufacturer key alone still cannot authorise a rollout.</>,
  },
  {
    q: "Does this replace our Uptane/TUF updater?",
    a: <>No. The device-side reference agent sits on top of, never instead of, an Uptane-style updater. It exists to validate the contract (signature chain, compatibility, revocation, signed receipts) that a production updater integration would satisfy. Real device rollout runs through your OTA platform.</>,
  },
  {
    q: "Which OTA integrations actually work today?",
    a: <>The <b>simulator</b> adapter is fully functional and powers the demo and end-to-end tests. The <b>Mender</b>, <b>hawkBit</b> and <b>balena</b> drivers implement the documented endpoint shapes but are <b>unverified</b> — they will not be surfaced as productive integrations until they have been smoke-tested with real sandbox credentials. See <Link href="/integrations">integrations</Link>.</>,
  },
  {
    id: "limitations",
    q: "What are the current limitations?",
    a: (
      <>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "var(--fc-slate)" }}>
          <li>On-chain contract deployment on testnet happens only with a funded key (tBOT from the official faucet); without it the deploy script exits with a clear funding message instead of a fake contract. Mainnet is gated behind a readiness review.</li>
          <li>Mender/hawkBit/balena adapters are unverified (shape-only) until sandbox-tested.</li>
          <li>Dev persistence defaults to a JSON file store; production uses Postgres via Prisma behind the same storage interface. Redis/BullMQ is optional in dev.</li>
          <li>Demo accounts are seeded by default — a real deployment must set <span className="mono" style={{ fontSize: 12.5 }}>SEED_DEMO=false</span>. MFA/SSO and hardware-bound sessions (FIDO2) are not in v1.</li>
          <li>The on-chain mirror stores decision trails and state hashes, not full manifests.</li>
          <li>The device agent is an instrumentation harness, not a bootloader replacement.</li>
          <li>Frontend visual regression is manual; contract fuzzing is targeted, not exhaustive; receipt ingestion at fleet scale has not been load-tested.</li>
        </ul>
      </>
    ),
  },
  {
    q: "What does an auditor actually get?",
    a: <>The append-only audit log (hash-chained, integrity re-checked on read), per-decision approval records with signature digests and comments, certificate-style transaction references (testnet 968 / mainnet 677) via the BOT Chain explorer, and device installation receipts with verified signatures.</>,
  },
];

export default function FaqPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="FAQ"
        title="Straight answers, including the inconvenient ones."
        sub="These questions come up in every evaluation. If yours is not here, ask us directly."
      />

      <section className="section-pad">
        <div className="container" style={{ maxWidth: 900 }}>
          <div style={{ display: "grid", gap: 14 }}>
            {QA.map((item) => (
              <Panel key={item.q} pad={24}>
                <div id={item.id} style={{ scrollMarginTop: 90 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 10 }}>
                    {item.q}
                  </div>
                  <div style={{ fontSize: 13.5, color: "var(--fc-slate)", lineHeight: 1.65 }}>
                    {item.a}
                  </div>
                </div>
              </Panel>
            ))}
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button href="/contact">Ask another question</Button>
            <Button href="/documentation" variant="secondary">Documentation</Button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
