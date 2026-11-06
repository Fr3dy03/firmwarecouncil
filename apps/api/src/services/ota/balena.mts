import { guardApprovalGate, NotVerifiedError, type AdapterCheck, type AdapterDeploymentRef, type OtaAdapter } from "./contract.mts";

/**
 * balena adapter (https://docs.balena.io/). balena pins a Fleet to a Release;
 * releasing a Fleet moves all devices. Maps FirmwareCouncil pause/supersede to
 * balena release freeze/preempt. UNVERIFIED until a real balenaCloud fleet is
 * exercised; no direct deployment-create concept exists — deployment is
 * implicit in fleet release promotion, so this adapter exposes freeze/release
 * endpoints instead.
 */
export class BalenaAdapter implements OtaAdapter {
  kind = "balena" as const;

  constructor(private apiBase: string, private token: string) {}

  async verify(): Promise<AdapterCheck> {
    try {
      const res = await fetch(`${this.apiBase}/v6/fleet`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(8000),
      });
      return { ok: res.ok, provider: this.kind, verified: false, message: res.ok ? "reachable (still unverified)" : `HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, provider: this.kind, verified: false, message: String(err?.message ?? err) };
    }
  }

  async deviceInventory(_filters: any) {
    // GET /v6/device?$filter=fleet
    throw new NotVerifiedError(this.kind, "deviceInventory");
  }

  async createDeployment(_input: { releaseStatus: string; releaseVersion: string; targetFilter: any }): Promise<AdapterDeploymentRef> {
    guardApprovalGate(_input.releaseStatus, this.kind);
    throw new NotVerifiedError(this.kind, "createDeployment (fleet->release promotion)");
  }

  async getDeploymentStatus(_deploymentId: string) {
    throw new NotVerifiedError(this.kind, "getDeploymentStatus (release state)");
  }

  async reportInstallation(_deploymentId: string) {
    throw new NotVerifiedError(this.kind, "reportInstallation");
  }

  async abortDeployment(_deploymentId: string) {
    // freeze the release to stop the rollout
    throw new NotVerifiedError(this.kind, "abortDeployment (release freeze)");
  }
}
