import type { Metadata } from "next";
import { Panel, SectionHeading, StatusPill, MonoRef, Button } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "Release governance",
  description:
    "The FirmwareCouncil release train: states, who can act in each, signed decisions with sha256 digests, EIP-712 binding and hash-chained audit records.",
};

const STATE_ROWS: Array<{ pill: string; who: string; transitions: string }> = [
  {
    pill: "DRAFT",
    who: "Manufacturer",
    transitions: "Submitted for review → PROPOSED",
  },
  {
    pill: "PROPOSED",
    who: "SECURITY_REVIEWER decides (APPROVE · REJECT · REQUEST_CHANGES)",
    transitions: "→ SECURITY_APPROVED · CHANGES_REQUESTED · REJECTED",
  },
  {
    pill: "CHANGES_REQUESTED",
    who: "Manufacturer revises and re-submits",
    transitions: "Back into security review",
  },
  {
    pill: "SECURITY_APPROVED",
    who: "OPERATOR decides (APPROVE · REJECT)",
    transitions: "→ OPERATOR_APPROVED · REJECTED",
  },
  {
    pill: "OPERATOR_APPROVED",
    who: "OPERATOR opens the canary",
    transitions: "→ CANARY_RUNNING",
  },
  {
    pill: "CANARY_RUNNING",
    who: "OPERATOR records the canary result from device receipts",
    transitions: "→ CANARY_PASSED · CANARY_FAILED",
  },
  {
    pill: "CANARY_PASSED",
    who: "OPERATOR authorises rollout and advances stages",
    transitions: "→ ROLLOUT_IN_PROGRESS",
  },
  {
    pill: "CANARY_FAILED",
    who: "No further action — failure halts the rollout",
    transitions: "Incident opened; rollout is blocked",
  },
  {
    pill: "ROLLOUT_IN_PROGRESS",
    who: "OPERATOR advances / pauses / resumes",
    transitions: "→ DEPLOYED · PAUSED",
  },
  {
    pill: "PAUSED",
    who: "OPERATOR resumes or revokes",
    transitions: "→ ROLLOUT_IN_PROGRESS · REVOKED",
  },
  {
    pill: "DEPLOYED",
    who: "Governance record only",
    transitions: "→ SUPERSEDED by a successor release",
  },
  {
    pill: "REJECTED",
    who: "Security reviewer or operator decision",
    transitions: "Terminal — a new release must be proposed",
  },
  {
    pill: "REVOKED",
    who: "OPERATOR, PLATFORM_ADMIN or SECURITY_REVIEWER; EMERGENCY_ADMIN for emergency pause",
    transitions: "Devices refuse revoked releases before install",
  },
  {
    pill: "SUPERSEDED",
    who: "Successor release replaces it",
    transitions: "Terminal record, kept for the audit trail",
  },
  {
    pill: "ROLLBACK_AUTHORISED",
    who: "OPERATOR, with a signed rollback decision",
    transitions: "Carries the target version and approval references",
  },
];

export default function ReleaseGovernancePage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Release governance"
        title="One release train, every state signed."
        sub="A firmware release in FirmwareCouncil moves through an explicit state machine. Each transition is a decision someone signed — and the audit trail is what proves they did."
      />

      {/* ---------------- state table ---------------- */}
      <section className="section-pad">
        <div className="container">
          <SectionHeading
            eyebrow="The release train"
            title="States, and who can act in each."
            sub="Roles map 1:1 to the ReleaseGovernance contract: MANUFACTURER proposes, SECURITY_REVIEWER reviews, OPERATOR executes, EMERGENCY_ADMIN pauses in emergencies. Distinct roles inside one organisation are not counted — approvals must come from different organisations when the review policy requires it."
          />
          <Panel pad={0}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", minWidth: 780, borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    {["State", "Status", "Who can act", "Transitions"].map((h) => (
                      <th key={h} style={{
                        textAlign: "left", padding: "12px 16px", fontSize: 11, fontWeight: 600,
                        letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--fc-text-2)",
                        borderBottom: "1px solid var(--fc-border)",
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {STATE_ROWS.map((r) => (
                    <tr key={r.pill} style={{ borderBottom: "1px solid var(--fc-border)" }}>
                      <td style={{ padding: "12px 16px" }}>
                        <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--fc-navy)" }}>{r.pill}</span>
                      </td>
                      <td style={{ padding: "12px 16px" }}><StatusPill status={r.pill} /></td>
                      <td style={{ padding: "12px 16px", color: "var(--fc-slate)" }}>{r.who}</td>
                      <td style={{ padding: "12px 16px", color: "var(--fc-text-2)" }}>{r.transitions}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </section>

      {/* ---------------- decision signatures ---------------- */}
      <section className="section-pad" style={{ background: "var(--fc-surface)", borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="Signed decisions"
            title="A signature digest with every approval."
            sub="The backend refuses any decision submitted without a signature. The digest is what turns an opinion into evidence."
          />
          <div className="grid-2">
            <Panel pad={24}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 12 }}>What is signed</div>
              <p style={{ fontSize: 13.5, color: "var(--fc-slate)", marginBottom: 8 }}>
                Release decisions are signed in exactly one of two forms:
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13.5, color: "var(--fc-slate)" }}>
                {[
                  "EIP-712 typed structured signing — chain-bound: chainId (968 testnet / 677 mainnet), the governance contract address and version, with the decision bound to releaseId, role, decision and nonce.",
                  "Ed25519 over the canonical digest of the manifest JSON — used for manufacturer manifest registration.",
                ].map((li) => (
                  <li key={li.slice(0, 24)} style={{ padding: "10px 0", borderTop: "1px solid var(--fc-border)", display: "flex", gap: 10 }}>
                    <span style={{ color: "var(--fc-blue)", fontWeight: 600 }}>›</span>
                    {li}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel pad={24}>
              <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 12 }}>How it is verified</div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, fontSize: 13.5, color: "var(--fc-slate)" }}>
                {[
                  "The server recomputes SHA-256 over the canonical manifest and checks the key's state (active → revoked blocks verification) and its product-line scope.",
                  "The signatureDigest (sha256 of the signed decision payload) is stored with the approval record, alongside who decided, in which role, and when.",
                  "Replay protection: EIP-712 nonces are tracked per signer; a second decision from the same approver in the same role on the same release is rejected with a 409.",
                  "On BOT Chain, SignatureChecker::isValidSignatureNow verifies that the recorded approver actually signed, mirroring the backend record.",
                ].map((li) => (
                  <li key={li.slice(0, 24)} style={{ padding: "10px 0", borderTop: "1px solid var(--fc-border)", display: "flex", gap: 10 }}>
                    <span style={{ color: "var(--fc-blue)", fontWeight: 600 }}>›</span>
                    {li}
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <Panel pad={22} style={{ marginTop: 32 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.05em", color: "var(--fc-navy)", marginBottom: 10 }}>
              EXAMPLE — AN APPROVAL RECORD AS STORED
            </div>
            <div
              className="mono"
              style={{ fontSize: 12.5, color: "var(--fc-slate)", display: "grid", gap: 4 }}
            >
              <span>releaseId: <MonoRef value="rel_vlt7_2_4_1" /></span>
              <span>governanceRole: SECURITY_REVIEWER · decision: APPROVE</span>
              <span>signatureDigest: <MonoRef value="9f2c41ab8d03e77fba01c5d9a1186ce2" max={32} /></span>
              <span>approverOrg: Sentinel Security (≠ manufacturer org)</span>
            </div>
          </Panel>
        </div>
      </section>

      {/* ---------------- audit chaining ---------------- */}
      <section className="section-pad">
        <div className="container">
          <SectionHeading
            eyebrow="Audit chaining"
            title="Hash-chained events, mirrored on BOT Chain."
            sub="Three writes per transition: the store (source of truth for the UI), the append-only audit log, and the ReleaseGovernance.sol mirror on BOT Chain."
          />
          <div className="grid-3">
            {[
              {
                t: "Hash-chained audit log",
                d: "Every state-changing action appends an AuditEvent with a sequence number, actor, organisation, kind, entity and the previous event's hash. The audit endpoint re-verifies the chain on read and reports whether it is intact.",
              },
              {
                t: "On-chain decision mirror",
                d: "ReleaseGovernance.sol records decision trails and state hashes, keyed by keccak(productLineId, versionHash). Release versions are unique on-chain — collided versions are rejected by the contract.",
              },
              {
                t: "No indexer dependence",
                d: "State reconstruction uses direct eth_call reads keyed by release/product IDs and stored transaction receipts — never unrestricted log indexing. Mainnet eth_getLogs is disabled on the official RPC, so the platform never assumes it (design decision FRC-D01).",
              },
            ].map((c) => (
              <Panel key={c.t} pad={22}>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fc-navy)", marginBottom: 8 }}>{c.t}</div>
                <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>{c.d}</p>
              </Panel>
            ))}
          </div>
          <div style={{ marginTop: 32, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button href="/security" variant="secondary">Read the security model</Button>
            <Button href="/sign-in">See the release train live</Button>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
