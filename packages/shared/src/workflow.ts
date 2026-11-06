import type { GovernanceRole, ReleaseStatus, UserRole } from "./types.js";

export const CONTRACT_ROLES: Record<GovernanceRole, string> = {
  MANUFACTURER: "MANUFACTURER_ROLE",
  SECURITY_REVIEWER: "SECURITY_REVIEWER_ROLE",
  OPERATOR: "OPERATOR_ROLE",
  EMERGENCY_ADMIN: "EMERGENCY_ADMIN_ROLE",
};

/** Who may act on a release in each state. */
export const STATE_ACTIONS: Record<ReleaseStatus, string[]> = {
  DRAFT: ["submit"],
  PROPOSED: ["security-review", "reject", "request-changes", "revoke"],
  CHANGES_REQUESTED: ["resubmit", "revoke"],
  SECURITY_APPROVED: ["operator-approve", "reject", "revoke"],
  OPERATOR_APPROVED: ["open-canary", "reject", "revoke"],
  CANARY_PASSED: ["advance-stage", "open-incident", "revoke"],
  REJECTED: [],
  CANARY_RUNNING: ["record-canary-result", "pause", "revoke", "open-incident"],
  CANARY_FAILED: ["open-incident", "rollback-authorise", "revoke"],
  ROLLOUT_IN_PROGRESS: ["advance-stage", "pause", "revoke", "open-incident"],
  PAUSED: ["resume", "rollback-authorise", "revoke"],
  DEPLOYED: ["supersede", "rollback-authorise"],
  REVOKED: [],
  SUPERSEDED: [],
  ROLLBACK_AUTHORISED: [],
};

export const DECISION_LABELS: Record<string, { label: string; tone: string }> = {
  APPROVE: { label: "APPROVED", tone: "green" },
  REJECT: { label: "REJECTED", tone: "red" },
  REQUEST_CHANGES: { label: "CHANGES REQUESTED", tone: "orange" },
};

export function canDecide(
  role: UserRole,
  releaseStatus: ReleaseStatus,
  decisionPhase: "SECURITY_REVIEW" | "OPERATOR_APPROVAL",
): boolean {
  if (role === "SECURITY_REVIEWER") {
    return decisionPhase === "SECURITY_REVIEW" && ["PROPOSED", "CHANGES_REQUESTED"].includes(releaseStatus);
  }
  if (role === "OPERATOR") {
    return decisionPhase === "OPERATOR_APPROVAL" && releaseStatus === "SECURITY_APPROVED";
  }
  if (role === "PLATFORM_ADMIN") return true;
  return false;
}
