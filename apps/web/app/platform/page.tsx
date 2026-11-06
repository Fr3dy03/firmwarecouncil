import type { Metadata } from "next";
import { Panel, SectionHeading, Button, DataTable, StatusPill, MonoRef } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";

export const metadata: Metadata = {
  title: "Platform",
  description:
    "The FirmwareCouncil control room: release wizard, approvals queue, rollout control, incident workflow, signing-key registry and the audit trail.",
};

function SurfaceItem({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, background: "var(--fc-blue)", borderRadius: 1, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: "var(--fc-navy)" }}>{title}</span>
      </div>
      <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>{body}</p>
    </div>
  );
}

export default function PlatformPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Platform"
        title="The control room for decisions about firmware."
        sub="FirmwareCouncil is a small, precise surface: propose releases, collect signed approvals, drive staged rollouts, handle incidents and keep the audit trail intact. It coordinates your OTA platform — it does not replace it."
      />

      {/* --------------------------------- surfaces */}
      <section className="section-pad">
        <div className="container">
          <SectionHeading
            eyebrow="What's inside"
            title="Seven working surfaces, one governance flow."
          />
          <div className="grid-2">
            <Panel pad={24}>
              <SurfaceItem
                title="Control room"
                body="An authenticated overview of your governance state: releases pipeline, open approvals, rollout progress, device fleets, open incidents and the last audit events. Everything on this page is attributed to your organisation and your role."
              />
              <SurfaceItem
                title="Release wizard"
                body="Proposes a release against a product line in explicit steps: version and build identifier, target hardware revisions, artifact digest (sha256 — recomputed server-side), external artifact URL on your own storage, compatibility policy and security notes. Digest registration refuses an already-registered digest reused for a different release on the same product line."
              />
              <SurfaceItem
                title="Approvals queue"
                body="What each role owes the train right now: security reviews for SECURITY_REVIEWER organisations, rollout authorisations for OPERATOR organisations. Decisions are APPROVE, REJECT or REQUEST_CHANGES, each submitted with a mandatory sha256 signature digest over the signed decision payload."
              />
            </Panel>
            <Panel pad={24}>
              <SurfaceItem
                title="Rollout control room"
                body="Canary and staged rollout state per release: eligible devices, contacted, successes, failures, offline. Operators advance stages past their dwell windows, pause mid-stage, resume, or revoke. Pause and revoke are pushed to the OTA adapter within a bounded window."
              />
              <SurfaceItem
                title="Incident workflow"
                body="Incidents are first-class records with severity (LOW · MEDIUM · HIGH · CRITICAL), status (OPEN · MITIGATING · RESOLVED), a responsible engineer, corrective action and evidence links. Deployment creation is refused while an incident is open on the release."
              />
              <SurfaceItem
                title="Signing-key registry"
                body="Ed25519 public keys only — private material never enters the platform. Keys carry an sha256 fingerprint, a product-line scope and a lifecycle: ACTIVE → ROTATING → REVOKED (or EXPIRED), with rotation lineage. Devices verify against the signed key manifest."
              />
              <SurfaceItem
                title="Audit trail"
                body="Every state-changing action appends an event with sequence, actor, organisation, kind and entity. Events are hash-chained (prevHash → hash) so gaps or edits are detectable, and chain-visible actions are mirrored to ReleaseGovernance.sol on BOT Chain."
              />
            </Panel>
          </div>
        </div>
      </section>

      {/* --------------------------------- example release row */}
      <section className="section-pad" style={{ background: "var(--fc-surface)", borderTop: "1px solid var(--fc-border)" }}>
        <div className="container">
          <SectionHeading
            eyebrow="In practice"
            title="One row in the approvals queue."
            sub="The demo control room ships seeded releases across organisations, so you can act on real queue items immediately."
          />
          <Panel pad={0}>
            <DataTable
              columns={[
                { key: "release", label: "Release" },
                { key: "status", label: "Status" },
                { key: "digest", label: "Artifact digest", mono: true },
                { key: "waiting", label: "Waiting on" },
              ]}
              rows={[
                {
                  release: "VLT-7 controller v2.4.1 — Ardane Hardware",
                  status: <StatusPill status="SECURITY_APPROVED" />,
                  digest: <MonoRef value="b391c5f6e02a887d4f1a9c30" max={14} />,
                  waiting: "Operator rollout authorisation",
                },
                {
                  release: "VLT-7 controller v2.4.2 — Ardane Hardware",
                  status: <StatusPill status="PROPOSED" />,
                  digest: <MonoRef value="e77f013c219ba80d4fa68b2f" max={14} />,
                  waiting: "Security review",
                },
                {
                  release: "SEN-2 gateway v1.9.0 — Nordholm Devices",
                  status: <StatusPill status="CANARY_RUNNING" />,
                  digest: <MonoRef value="41be9d2c07aa5f83c6e1b447" max={14} />,
                  waiting: "Canary receipts (dwell window)",
                },
              ]}
            />
          </Panel>
        </div>
      </section>

      <section className="section-pad">
        <div className="container" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Button href="/sign-in">Open control room</Button>
          <Button href="/release-governance" variant="secondary">Release governance deep dive</Button>
        </div>
      </section>
    </SiteShell>
  );
}
