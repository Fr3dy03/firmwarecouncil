/**
 * FirmwareCouncil design tokens — industrial release control room.
 * Single source for marketing site + authenticated app.
 */
export const TOKENS = {
  color: {
    background: "#F1F4F6",
    surface: "#FFFFFF",
    navy: "#172536",
    slate: "#34485A",
    text: "#24313B",
    textSecondary: "#71808B",
    releaseBlue: "#286C9B",
    paleBlue: "#E8F0F6",
    approvalGreen: "#348467",
    safetyOrange: "#ED8738",
    paleOrange: "#FFF0E3",
    dangerRed: "#C74743",
    border: "#D6DFE5",
  },
  font: {
    sans: "'IBM Plex Sans', system-ui, sans-serif",
    mono: "'IBM Plex Mono', ui-monospace, monospace",
  },
  radius: { card: "6px", pill: "3px", control: "4px" },
  type: {
    display: { size: "clamp(2.6rem, 5vw, 4.1rem)", weight: 600, lh: 1.08 },
    h2: { size: "clamp(1.7rem, 3vw, 2.4rem)", weight: 600, lh: 1.16 },
    h3: { size: "1.05rem", weight: 600, lh: 1.3 },
    body: { size: "15px", weight: 400, lh: 1.6 },
    small: { size: "13px", weight: 400, lh: 1.5 },
    micro: { size: "11px", weight: 500, lh: 1.4, tracking: "0.06em" },
  },
} as const;

/** Semantic status colour map (used by status pills, banners, timeline). */
export const STATUS_COLOR: Record<string, keyof typeof TOKENS.color> = {
  PROPOSED: "slate",
  CHANGES_REQUESTED: "safetyOrange",
  SECURITY_APPROVED: "releaseBlue",
  REJECTED: "dangerRed",
  CANARY_RUNNING: "safetyOrange",
  CANARY_FAILED: "dangerRed",
  ROLLOUT_IN_PROGRESS: "releaseBlue",
  PAUSED: "safetyOrange",
  DEPLOYED: "approvalGreen",
  REVOKED: "dangerRed",
  SUPERSEDED: "textSecondary",
  ROLLBACK_AUTHORISED: "dangerRed",
  DRAFT: "textSecondary",
  ONLINE: "approvalGreen",
  OFFLINE: "textSecondary",
  OUTDATED: "safetyOrange",
  FAILED_UPTAKE: "dangerRed",
  RETIRED: "textSecondary",
  SUCCESS: "approvalGreen",
  FAILURE: "dangerRed",
  PENDING: "safetyOrange",
  APPROVE: "approvalGreen",
  MEDIUM: "safetyOrange",
  HIGH: "safetyOrange",
  CRITICAL: "dangerRed",
  LOW: "textSecondary",
  OPEN: "dangerRed",
  MITIGATING: "safetyOrange",
  RESOLVED: "approvalGreen",
};
