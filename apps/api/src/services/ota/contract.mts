import type { AdapterKind } from "@fc/shared";

/**
 * OTA adapter contract. Providers:
 *  - simulator : local fleet model — the reference integration (works in demo).
 *  - mender    : shape implemented against docs.mender.io Management API (v1)
 *                — UNVERIFIED until sandbox credentials smoke-test every path.
 *  - hawkbit   : docs.eclipse.dev/hawkbit — UNVERIFIED.
 *  - balena    : docs.balena.io — UNVERIFIED.
 */

export interface AdapterCheck {
  ok: boolean;
  provider: AdapterKind;
  message: string;
  verified: boolean;
}

export interface AdapterDeploymentRef {
  id: string;
  provider: AdapterKind;
  createdAt: string;
}

export interface OtaAdapter {
  kind: AdapterKind;
  verify(): Promise<AdapterCheck>;
  deviceInventory(filters: { productLineId?: string; fleetId?: string }): Promise<any[]>;
  createDeployment(input: { releaseVersion: string; artifactUrl: string; targetFilter: any }): Promise<AdapterDeploymentRef>;
  getDeploymentStatus(deploymentId: string): Promise<any>;
  reportInstallation(deploymentId: string): Promise<any>;
  abortDeployment(deploymentId: string): Promise<boolean>;
}

export class NotVerifiedError extends Error {
  constructor(public provider: AdapterKind, public what: string) {
    super(`${provider}: "${what}" cannot be executed — integration not yet verified with real credentials (see INTEGRATION_LIMITATIONS.md)`);
  }
}

/** Validates that a deployment may only be planned for an APPROVED release. */
export function guardApprovalGate(releaseStatus: string, adapter: AdapterKind) {
  const authorised = ["OPERATOR_APPROVED", "CANARY_RUNNING", "CANARY_PASSED", "ROLLOUT_IN_PROGRESS", "PAUSED", "DEPLOYED"].includes(releaseStatus);
  if (!authorised) {
    throw new NotVerifiedError(adapter, `deployment planning for release in state ${releaseStatus}`);
  }
}
