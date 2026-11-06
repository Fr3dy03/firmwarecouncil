import type { Metadata } from "next";
import Link from "next/link";
import { Panel, PanelTitle, SectionHeading, Button } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "FirmwareCouncil documentation index: research and rationale, architecture, security model, OTA integrations, the REST API surface under /api/v1, and known limitations.",
};

const DOC_SECTIONS: Array<{ title: string; anchor: string; body: React.ReactNode }> = [
  {
    title: "Research & rationale",
    anchor: "research",
    body: (
      <>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 10 }}>
          Why the governance layer is the defensible product: Uptane/TUF provide
          compromise-resilient metadata frameworks; Mender, hawkBit and balena provide
          device inventories, deployments and artifact hosting. What neither covers is
          the governance plane — organisation-to-organisation approvals, accountability,
          staged rollout policy and incident/rollback coordination.
        </p>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>
          The research also records the BOT Chain constraint that shaped the design:
          <span className="mono" style={{ fontSize: 12.5 }}> eth_getLogs</span> is disabled
          on mainnet official endpoints, so all state reconstruction uses direct{" "}
          <span className="mono" style={{ fontSize: 12.5 }}>eth_call</span> reads plus
          stored transaction receipts (decision FRC-D01).
        </p>
      </>
    ),
  },
  {
    title: "Architecture",
    anchor: "architecture",
    body: (
      <>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 10 }}>
          Topology: a Next.js web app (marketing at <span className="mono" style={{ fontSize: 12.5 }}>/</span>,
          control room at <span className="mono" style={{ fontSize: 12.5 }}>/app/*</span>), a Fastify
          API on <span className="mono" style={{ fontSize: 12.5 }}>:4100</span> serving everything under{" "}
          <span className="mono" style={{ fontSize: 12.5 }}>/api/v1</span>, JSON-file or Prisma persistence,
          optional Redis/BullMQ jobs, OTA adapters, and BOT Chain (testnet 968 / mainnet 677)
          via viem against <span className="mono" style={{ fontSize: 12.5 }}>ReleaseGovernance.sol</span>.
        </p>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>
          Every release-state transition is written to the store (UI source of truth),
          the append-only audit log, and the on-chain mirror. Supporting packages:
          shared domain types, Foundry contracts, the device reference agent, and viem
          deploy scripts.
        </p>
      </>
    ),
  },
  {
    title: "Security model",
    anchor: "security-model",
    body: (
      <>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 10 }}>
          Assets and actors: private signing keys (customer-held), firmware binaries
          (never stored here — digests only), session credentials (scrypt hashing plus a
          server-side revocation list) and the audit log (hash-chained{" "}
          <span className="mono" style={{ fontSize: 12.5 }}>prevHash → hash</span>).
        </p>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>
          Controls: multi-party approval with cross-organisation quorum, a verification
          chain over EIP-712/Ed25519 signatures, replay protection via per-signer nonces,
          strict manifest schema, duplicate-artifact guards, and emergency pause/rollback
          restricted to contract access-control roles.{" "}
          <Link href="/security">Read the security summary</Link>.
        </p>
      </>
    ),
  },
  {
    title: "OTA integrations",
    anchor: "ota",
    body: (
      <>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 10 }}>
          The integration contract is a single OTAAdapter interface
          (verify · deviceInventory · createDeployment · getDeploymentStatus ·
          reportInstallation · abortDeployment) implemented by the simulator
          (<b>functional</b> today), Mender, hawkBit and balena — the last three are{" "}
          <b>shape-only</b> and must be smoke-tested with real sandbox credentials
          before they surface as productive integrations.
        </p>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>
          <Link href="/integrations">Per-adapter verification status</Link> is stated
          openly in the product itself.
        </p>
      </>
    ),
  },
  {
    title: "Known limitations",
    anchor: "limitations",
    body: (
      <>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 10 }}>
          Stated precisely, as part of the security posture: testnet contract
          deployment happens only with a funded key from the official faucet; mainnet
          is gated behind a readiness review. Mender/hawkBit/balena adapters are{" "}
          <b>unverified</b>. Dev default persistence is a JSON file store (Postgres in
          production via Prisma; the storage interface is identical). Demo accounts must
          be disabled for real deployments (<span className="mono" style={{ fontSize: 12.5 }}>SEED_DEMO=false</span>);
          MFA/SSO and hardware-bound sessions (FIDO2) are not in v1. The device agent is
          an instrumentation harness, not a bootloader.{" "}
          <Link href="/faq#limitations">Limitations FAQ</Link>.
        </p>
      </>
    ),
  },
];

const API_GROUPS: Array<{ group: string; endpoints: string[] }> = [
  {
    group: "Sessions",
    endpoints: [
      "POST /auth/login", "POST /auth/logout", "GET /auth/me",
      "GET /users", "POST /invitations", "GET /organisations", "GET /status",
    ],
  },
  {
    group: "Product lines & releases",
    endpoints: [
      "POST /product-lines", "GET /product-lines", "GET /product-lines/:id",
      "POST /releases", "GET /releases", "GET /releases/:id",
      "POST /releases/:id/approve", "POST /releases/:id/reject",
      "POST /releases/:id/request-changes", "POST /releases/:id/signature",
      "POST /releases/:id/rollout (open-canary | record-canary-result | authorise-rollout | advance | pause | resume | revoke | rollback | supersede)",
      "GET /releases/:id/pipeline",
    ],
  },
  {
    group: "Fleets, devices & receipts",
    endpoints: [
      "GET /fleets", "GET /fleets/:id", "GET /devices", "POST /devices",
      "POST /devices/:id/receipts", "GET /devices/:id/receipts",
    ],
  },
  {
    group: "Incidents",
    endpoints: [
      "GET /incidents", "POST /incidents", "GET /incidents/:id",
      "POST /incidents/:id", "POST /incidents/:id/comments",
    ],
  },
  {
    group: "Signing keys",
    endpoints: [
      "POST /keys", "GET /keys", "POST /keys/:id/rotate",
      "POST /keys/:id/revoke", "GET /keys/manifest",
    ],
  },
  {
    group: "Integrations & audit",
    endpoints: [
      "GET /integrations", "POST /integrations/:id/verify",
      "GET /audit (hash-chain integrity check included)", "GET /health",
    ],
  },
];

export default function DocumentationPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Documentation"
        title="Everything the platform claims, written down."
        sub="The documentation ships with the repository. This index summarises each section and links to the live equivalents in the product."
      />

      <section className="section-pad">
        <div className="container">
          <div className="grid-2">
            {DOC_SECTIONS.map((s) => (
              <Panel key={s.title} pad={24} style={{ scrollMarginTop: 80 }} // anchored content
              >
                <div id={s.anchor} className="eyebrow" style={{ marginBottom: 10 }}>{s.title}</div>
                {s.body}
              </Panel>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- API reference ---------------- */}
      <section id="api" className="section-pad" style={{ background: "var(--fc-surface)", borderTop: "1px solid var(--fc-border)", scrollMarginTop: 80 }}>
        <div className="container">
          <SectionHeading
            eyebrow="REST API"
            title="One surface, under /api/v1."
            sub="Authentication is a bearer session token (Authorization: Bearer <token>); errors return { error: { code, message } } with proper HTTP status codes. Every state-changing action appends to the audit trail. There are no other endpoints — this is the complete current surface."
          />
          <div className="grid-2">
            {API_GROUPS.map((g) => (
              <Panel key={g.group} pad={22}>
                <PanelTitle>{g.group}</PanelTitle>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {g.endpoints.map((e) => (
                    <li
                      key={e}
                      className="mono"
                      style={{ fontSize: 12, color: "var(--fc-slate)", padding: "6px 0", borderTop: "1px solid var(--fc-border)" }}
                    >
                      {e}
                    </li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
          <Panel pad={18} style={{ marginTop: 28 }}>
            <div style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>
              In the demo deployment, the web app proxies{" "}
              <span className="mono" style={{ fontSize: 12 }}>/api/v1/*</span> to the Fastify
              API at <span className="mono" style={{ fontSize: 12 }}>127.0.0.1:4100</span>.
              Sessions are demonstrated with seeded accounts on the sign-in page.
            </div>
          </Panel>
        </div>
      </section>

      <section className="section-pad">
        <div className="container" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button href="/faq" variant="secondary">Read the FAQ</Button>
          <Button href="/contact" variant="ghost">Contact us for a deeper walkthrough</Button>
        </div>
      </section>
    </SiteShell>
  );
}
