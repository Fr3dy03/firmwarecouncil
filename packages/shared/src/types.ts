/**
 * FirmwareCouncil domain types — single source of truth.
 * Consumed by apps/api (Fastify), apps/web (Next.js) and packages/device-sim.
 */

export type UserRole = "MANUFACTURER" | "SECURITY_REVIEWER" | "OPERATOR" | "PLATFORM_ADMIN";

export type OrgType = "MANUFACTURER" | "OPERATOR" | "SECURITY" | "PLATFORM";

/** Governance decision roles (map 1:1 to contract roles). */
export type GovernanceRole = "MANUFACTURER" | "SECURITY_REVIEWER" | "OPERATOR" | "EMERGENCY_ADMIN";

export type DecisionKind = "APPROVE" | "REJECT" | "REQUEST_CHANGES";

export type ReleaseStatus =
  | "DRAFT"
  | "PROPOSED"
  | "CHANGES_REQUESTED"
  | "SECURITY_APPROVED"      // security review passed, awaiting operator approval
  | "OPERATOR_APPROVED"      // operator authorised; canary can open
  | "CANARY_PASSED"
  | "REJECTED"
  | "CANARY_RUNNING"
  | "CANARY_FAILED"
  | "ROLLOUT_IN_PROGRESS"
  | "PAUSED"
  | "DEPLOYED"
  | "REVOKED"
  | "SUPERSEDED"
  | "ROLLBACK_AUTHORISED";

export type RolloutStageKind = "CANARY" | "SMALL" | "MEDIUM" | "LARGE" | "FULL";

export type DeviceStatus = "ONLINE" | "OFFLINE" | "OUTDATED" | "FAILED_UPTAKE" | "RETIRED";

export type ReceiptOutcome = "SUCCESS" | "FAILURE" | "PENDING" | "REJECTED";

export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type IncidentStatus = "OPEN" | "MITIGATING" | "RESOLVED";

export type SigningKeyState = "ACTIVE" | "ROTATING" | "REVOKED" | "EXPIRED";

export type AdapterKind = "simulator" | "mender" | "hawkbit" | "balena";

// ---------------------------------------------------------------- entities

export interface Organisation {
  id: string;
  name: string;
  type: OrgType;
  vendorAddress?: string;    // BOT address for on-chain audit trail
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  organisationId: string;
  role: UserRole;
  createdAt: string;
  passwordHash: string;
}

export interface SigningKey {
  id: string;
  organisationId: string;
  label: string;
  publicKey: string;               // base64 raw Ed25519 public key
  fingerprint: string;             // sha256 fingerprint, colon segmented
  productScope: string[];          // empty = all product lines of org
  state: SigningKeyState;
  validFrom: string;
  expiresAt?: string;
  revokedAt?: string;
  rotatedFrom?: string;
  notes?: string;
}

export interface HardwareRevision {
  id: string;
  productLineId: string;
  revision: string;                // e.g. "B3"
  architecture: string;            // e.g. "armv7-m", "riscv32imac"
  bootloaderRequirement: string;
  createdAt: string;
}

export interface ProductLine {
  id: string;
  organisationId: string;
  name: string;
  productName: string;
  hardwareRevisions: HardwareRevision[];
  defaultArchitecture: string;
  bootloaderRequirements: string;
  otaProviderId: string;
  compatibilityPolicy: string;
  supportedFirmwareVersions: string[];
  createdAt: string;
  active: boolean;
}

export interface ReleaseManifest {
  releaseId: string;
  version: string;
  buildIdentifier: string;
  targetRevisions: string[];
  artifactDigestSha256: string;
  artifactSizeBytes: number;
  artifactUrl: string;             // external OTA repo URL — never uploaded here
  productCompatibility: string;
  securityNotes: string;
  previousReleaseId?: string;
  manifestDigest: string;          // sha256 over canonical manifest JSON
}

export interface ReleaseApproval {
  id: string;
  releaseId: string;
  approverUserId: string;
  approverOrganisationId: string;
  governanceRole: GovernanceRole;
  decision: DecisionKind;
  timestamp: string;
  signatureDigest: string;         // sha256 of signed decision payload
  comments: string;
}

export interface RolloutStage {
  id: string;
  rolloutPolicyId: string;
  order: number;
  kind: RolloutStageKind;
  targetPercent: number;           // percent of eligible fleet for this stage
  minDwellMinutes: number;
  requiresManualAdvance: boolean;
  autoHaltOnFailurePercent: number;
}

export interface RolloutPolicy {
  id: string;
  releaseId: string;
  canaryCohortSize: number;
  stages: RolloutStage[];
  requiresOperatorApproval: boolean;
  rollbackTargetReleaseId?: string;
  createdAt: string;
}

export interface RolloutState {
  id: string;
  releaseId: string;
  rolloutPolicyId: string;
  status: "PRE_CANARY" | "CANARY" | "RUNNING" | "PAUSED" | "COMPLETED" | "ABORTED";
  currentStageOrder: number;
  stageStartedAt?: string;
  startedAt?: string;
  pausedAt?: string;
  progress: {
    eligibleDevices: number;
    contacted: number;
    successes: number;
    failures: number;
    offline: number;
  };
}

export interface Device {
  id: string;
  fleetId: string;
  deviceRef: string;
  hardwareRevisionId: string;
  productLineId: string;
  lastSeenAt?: string;
  status: DeviceStatus;
  activeVersion?: string;
  lastVerifiedVersion?: string;
}

export interface DeviceFleet {
  id: string;
  organisationId: string;
  name: string;
  productLineId: string;
  createdAt: string;
}

export interface InstallationReceipt {
  id: string;
  releaseId: string;
  deviceId: string;
  outcome: ReceiptOutcome;
  version: string;
  artifactDigestSha256: string;
  failureReason?: string;
  deviceSignature: string;
  receivedAt: string;
  batchId?: string;
  onChainCommitTx?: string;
}

export interface Incident {
  id: string;
  releaseId: string;
  organisationId: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  title: string;
  failureReason: string;
  responsibleEngineerId?: string;
  correctiveAction?: string;
  evidenceLinks: string[];
  openedAt: string;
  resolvedAt?: string;
}

export interface IncidentComment {
  id: string;
  incidentId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface OTAIntegration {
  id: string;
  organisationId: string;
  kind: AdapterKind;
  label: string;
  baseUrl: string;
  credentialRef: string;           // reference only — secrets in vault/env
  verified: boolean;               // true only after sandbox smoke test
  createdAt: string;
}

export type TxKind =
  | "PRODUCT_LINE_REGISTERED"
  | "RELEASE_PROPOSED"
  | "RELEASE_APPROVED"
  | "RELEASE_REJECTED"
  | "CANARY_OPENED"
  | "CANARY_RESULT"
  | "ROLLOUT_AUTHORISED"
  | "ROLLOUT_ADVANCED"
  | "ROLLOUT_PAUSED"
  | "RELEASE_REVOKED"
  | "SIGNER_REGISTERED"
  | "SIGNER_REVOKED"
  | "BATCH_RECEIPT";

export interface GovernanceTransaction {
  id: string;
  kind: TxKind;
  relatedEntityId: string;
  chainId: number;
  hash?: string;
  status: "PENDING" | "ANNOUNCED" | "CONFIRMED" | "FAILED";
  createdAt: string;
  error?: string;
}

export interface AuditEvent {
  id: string;
  sequence: number;
  timestamp: string;
  actorUserId?: string;
  actorOrganisationId?: string;
  kind: string;
  entity: string;
  detail: string;
  prevHash?: string;
  hash?: string;
}

export interface AppReleaseSummary {
  releaseId: string;
  version: string;
  status: ReleaseStatus;
  productName: string;
  productLineId: string;
  manifestDigest: string;
  artifactDigestSha256: string;
  createdAt: string;
  manufacturerOrgName: string;
}

// ---------------------------------------------------------------- session

export interface SessionUser {
  userId: string;
  organisationId: string;
  role: UserRole;
  email: string;
  name: string;
  orgName: string;
  orgType: OrgType;
}

export const RELEASE_TRAIN_STEPS = [
  "PROPOSED",
  "SECURITY REVIEW",
  "OPERATOR APPROVAL",
  "CANARY",
  "ROLLOUT",
  "DEPLOYED",
] as const;
