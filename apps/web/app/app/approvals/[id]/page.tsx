"use client";

/**
 * DECISION PAGE for one release (SECURITY_REVIEWER / OPERATOR / admin).
 * Manifest facts up front; decision buttons per canDecide(); signatureDigest
 * derived from the council convention sha256("<releaseId>|<govRole>|<decision>")
 * (apps/api/scripts/e2e.mts), with an advanced override. All backend errors
 * are surfaced verbatim.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, useSession } from "../../../../lib/api";
import {
  Panel, PanelTitle, StatusPill, ApprovalTimeline, Button, Field, inputStyle, Modal,
} from "../../../../components/fc/ui";
import { canDecide } from "@fc/shared/workflow";
import type { ReleaseStatus, UserRole } from "@fc/shared/types";

interface ApprovalRec {
  id: string; approverUserId: string; governanceRole: string;
  decision: string; timestamp: string; signatureDigest: string; comments: string;
}
interface ReleaseDetail {
  id: string; status: string; createdAt: string;
  productLine?: { name: string; productName: string } | null;
  manufacturer?: { name: string } | null;
  manifest: Record<string, any>;
  approvals: ApprovalRec[];
  rolloutPolicy?: { canaryCohortSize: number; stages: Array<{ order: number; kind: string; targetPercent: number }> } | null;
}

type Phase = "SECURITY_REVIEW" | "OPERATOR_APPROVAL";
type Decision = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 14, padding: "7px 0", borderBottom: "1px solid var(--fc-border)", fontSize: 13 }}>
      <div style={{ width: 200, flexShrink: 0, color: "var(--fc-text-2)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600, paddingTop: 2 }}>{k}</div>
      <div style={mono ? { fontFamily: "var(--font-mono)", fontSize: 12, wordBreak: "break-all" } : undefined}>{v}</div>
    </div>
  );
}

export default function ApprovalDecisionPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useSession();
  const role = user?.role as UserRole | undefined;

  const [detail, setDetail] = useState<ReleaseDetail | null>(null);  const [feedErr, setFeedErr] = useState("");
  const [actErr, setActErr] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);

  // decision dialog state (refs so the async submit reads fresh values)
  const [dialog, setDialog] = useState<null | { decision: Decision; phase: Phase }>(null);
  const comments = useRef("");
  const overrideDigest = useRef("");

  const load = useCallback(async () => {
    setFeedErr("");
    try {
      const d = await api<ReleaseDetail>(`/api/v1/releases/${id}`);
      setDetail(d);
    } catch (e) {
      setFeedErr((e as Error)?.message ?? String(e));
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  // phase is determined by status + reviewer seat (mirrors backend gating)
  const status = detail?.status as ReleaseStatus | undefined;
  const phase: Phase | null =
    status && status !== "SECURITY_APPROVED" && canDecide(role ?? "MANUFACTURER", status, "SECURITY_REVIEW")
      ? "SECURITY_REVIEW"
      : status && canDecide(role ?? "MANUFACTURER", status, "OPERATOR_APPROVAL")
        ? "OPERATOR_APPROVAL"
        : null;
  const govRole = phase === "OPERATOR_APPROVAL" ? "OPERATOR" : "SECURITY_REVIEWER";

  async function recordDecision() {
    if (!dialog) return;
    const { decision, phase: ph } = dialog;
    setBusy(true); setActErr(""); setBanner("");
    try {
      const digest = overrideDigest.current.trim() || (await sha256Hex(`${id}|${govRole}|${decision}`));
      const endpoint = decision === "APPROVE" ? "approve" : decision === "REJECT" ? "reject" : "request-changes";
      await api(`/api/v1/releases/${id}/${endpoint}`, {
        method: "POST",
        body: { phase: ph, comments: comments.current, signatureDigest: digest },
      });
      setBanner(`Decision ${decision} recorded — status updated.`);
      setDialog(null);
      await load();
    } catch (e) {
      setActErr((e as Error)?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  const timeline: Array<{ title: string; when: string; body: React.ReactNode }> = (detail?.approvals ?? []).map((ap) => ({
    title: `${ap.decision} — ${ap.governanceRole.replace(/_/g, " ").toLowerCase()}`,
    when: ap.timestamp,
    body: (
      <>
        <span className="mono">{"user "}{ap.approverUserId.slice(0, 8)}…</span>
        <span style={{ display: "block" }}>sig <span className="mono">{ap.signatureDigest.slice(0, 24)}…</span></span>
        {ap.comments ? <span style={{ fontStyle: "italic", display: "block" }}>“{ap.comments}”</span> : null}
      </>
    ),
  }));

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <Link href="/app/approvals" style={{ fontSize: 12.5 }}>← Approval queue</Link>
      </div>

      <div style={{ maxWidth: 760, marginBottom: 30 }}>
        <div className="eyebrow" style={{ marginBottom: 10 }}>Decision</div>
        <h2 style={{ fontSize: "clamp(1.7rem,3vw,2.3rem)", color: "var(--fc-navy)", lineHeight: 1.15, marginBottom: 12 }}>
          {detail ? `v${detail.manifest?.version} — ${detail.productLine?.name ?? ""}` : "Loading release…"}
        </h2>
        <p style={{ color: "var(--fc-text-2)", fontSize: 15, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {detail ? (
            <>
              Status <StatusPill status={detail.status} small />
              <span>· proposed {detail.createdAt.slice(0, 16).replace("T", " ")}</span>
              {detail.manufacturer ? <span>by {detail.manufacturer.name}</span> : null}
            </>
          ) : null}
        </p>
      </div>

      {feedErr ? (
        <Panel style={{ marginBottom: 20, borderLeft: "3px solid var(--fc-red)" }}>
          <PanelTitle>Feed error</PanelTitle>
          <p style={{ fontSize: 13.5, color: "var(--fc-red)" }}>{feedErr}</p>
          <Button variant="ghost" onClick={() => void load()}>Retry</Button>
        </Panel>
      ) : null}

      {detail ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,3fr) minmax(0,2fr)", gap: 22 }}>
          <div style={{ display: "grid", gap: 22 }}>
            {/* manifest facts */}
            <Panel>
              <PanelTitle right={<span style={{ fontSize: 11, color: "var(--fc-text-2)" }}>facts under decision</span>}>Manifest facts</PanelTitle>
              <KV k="Manifest digest" v={<span className="mono" style={{ fontSize: 13 }}>{detail.manifest?.manifestDigest}</span>} mono />
              <KV k="Artifact digest" v={<span className="mono">{detail.manifest?.artifactDigestSha256}</span>} mono />
              <KV k="Build identifier" v={<span className="mono">{detail.manifest?.buildIdentifier}</span>} />
              <KV k="Target revisions" v={<span className="mono">{(detail.manifest?.targetRevisions ?? []).join(" · ")}</span>} />
              <KV k="Size / URL" v={<><span className="mono">{detail.manifest?.artifactSizeBytes?.toLocaleString()} B</span> · <span className="mono" style={{ wordBreak: "break-all" }}>{detail.manifest?.artifactUrl}</span></>} />
              <KV k="Compatibility" v={detail.manifest?.productCompatibility || "—"} />
              <KV k="Security notes" v={detail.manifest?.securityNotes || "(none)"} />
              <KV k="Rollout policy" v={detail.rolloutPolicy ? <span className="mono">cohort {detail.rolloutPolicy.canaryCohortSize} · {detail.rolloutPolicy.stages.map((s) => `${s.kind}@${s.targetPercent}%`).join(" → ")}</span> : "none attached"} />
            </Panel>

            {/* approvals timeline */}
            <Panel>
              <PanelTitle>Existing approvals</PanelTitle>
              {timeline.length ? <ApprovalTimeline events={timeline as any} /> : <p style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>No recorded approvals yet.</p>}
            </Panel>
          </div>

          {/* decision panel */}
          <div style={{ display: "grid", gap: 22, alignContent: "start" }}>
            <Panel>
              <PanelTitle right={<span style={{ fontSize: 11, color: "var(--fc-text-2)" }}>{phase ?? "not actionable for your seat"}</span>}>Record decision</PanelTitle>
              {actErr ? (
                <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
                  {actErr}
                </div>
              ) : null}
              {banner ? (
                <div style={{ border: "1px solid var(--fc-green)", background: "#E9F3EE", color: "var(--fc-green)", borderRadius: 4, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>
                  {banner}
                </div>
              ) : null}
              {phase ? (
                <>
                  <div style={{ fontSize: 13, color: "var(--fc-slate)", marginBottom: 14 }}>
                    Your decision is recorded with an auto-derived sha256 signature digest
                    (<span className="mono">{govRole}</span> · {phase}). Council rule: reviewers must sit in a different
                    organisation from the manufacturer — the backend enforces this.
                  </div>
                  <div style={{ display: "grid", gap: 9 }}>
                    <Button onClick={() => { comments.current = ""; overrideDigest.current = ""; setDialog({ decision: "APPROVE", phase }); }}>Approve</Button>
                    <Button variant="secondary" onClick={() => { comments.current = ""; overrideDigest.current = ""; setDialog({ decision: "REQUEST_CHANGES", phase }); }}>Request changes</Button>
                    <Button variant="danger" onClick={() => { comments.current = ""; overrideDigest.current = ""; setDialog({ decision: "REJECT", phase }); }}>Reject</Button>
                  </div>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--fc-text-2)" }}>
                  {`This release (status ${status}) is not awaiting a decision from your seat. `}
                  {role === "PLATFORM_ADMIN" ? "" : "See /app/approvals for actionable items."}
                </p>
              )}
              <p style={{ marginTop: 16 }}>
                <Button variant="ghost" href={`/app/releases/${id}`}>Open full control room →</Button>
              </p>
            </Panel>
          </div>
        </div>
      ) : null}

      {/* decision dialog */}
      {dialog ? (
        <Modal
          title={`Decision — ${dialog.decision}`}
          onClose={() => setDialog(null)}
          width={540}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button variant={dialog.decision === "APPROVE" ? "primary" : "danger"} disabled={busy} onClick={() => void recordDecision()}>
                {busy ? "Recording…" : "Record decision"}
              </Button>
            </>
          }
        >
          <Field label="Comments (stored with the approval)">
            <textarea
              style={{ ...inputStyle, minHeight: 90, resize: "vertical" }}
              value={comments.current}
              onChange={(e) => { comments.current = e.target.value; setDialog((d) => (d ? { ...d } : d)); }}
            />
          </Field>
          <div style={{ fontSize: 12, color: "var(--fc-text-2)", marginBottom: 10 }}>
            signatureDigest = <span className="mono">sha256("{(dialog.phase ?? "")}·role·{dialog.decision}")</span> — auto-derived per e2e convention.
          </div>
          <details style={{ fontSize: 12.5 }}>
            <summary style={{ cursor: "pointer", color: "var(--fc-text-2)" }}>Advanced — override signature digest</summary>
            <input
              className="mono"
              style={{ ...inputStyle, fontFamily: "var(--font-mono)", fontSize: 12, marginTop: 8 }}
              defaultValue=""
              onChange={(e) => { overrideDigest.current = e.target.value; }}
              placeholder="64-hex digest"
            />
          </details>
        </Modal>
      ) : null}
    </div>
  );
}
