import { guardApprovalGate, NotVerifiedError, type AdapterCheck, type AdapterDeploymentRef, type OtaAdapter } from "./contract.mts";

/**
 * hawkBit adapter — rollout-group based deployment
 * (https://eclipse.dev/hawkbit/). Maps FirmwareCouncil Stage -> hawkBit
 * rollout group; uses Mgmt API with statuses creating/ready/running/paused/
 * stopping/finished. UNVERIFIED until a sandbox tenant is exercised.
 */
export class HawkbitAdapter implements OtaAdapter {
  kind = "hawkbit" as const;

  constructor(private baseUrl: string, private token: string) {}

  async verify(): Promise<AdapterCheck> {
    try {
      const res = await fetch(`${this.baseUrl}/rest/v1/rollouts?limit=1`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(8000),
      });
      return { ok: res.ok, provider: this.kind, verified: false, message: res.ok ? "reachable (still unverified)" : `HTTP ${res.status}` };
    } catch (err: any) {
      return { ok: false, provider: this.kind, verified: false, message: String(err?.message ?? err) };
    }
  }

  async deviceInventory(filters: any) {
    // GET /rest/v1/targets?q=filters...
    throw new NotVerifiedError(this.kind, "deviceInventory");
  }

  async createDeployment(input: { releaseStatus: string; releaseVersion: string; targetFilter: any }): Promise<AdapterDeploymentRef> {
    guardApprovalGate(input.releaseStatus, this.kind);
    // POST /rest/v1/rollouts { name, distributionSetId, targetFilterQuery, actionType, ... }
    throw new NotVerifiedError(this.kind, "createDeployment");
  }

  async getDeploymentStatus(_deploymentId: string) {
    // GET /rest/v1/rollouts/{id} — statusReady/statusRunning/statusPaused/statusFinished
    throw new NotVerifiedError(this.kind, "getDeploymentStatus");
  }

  async reportInstallation(_deploymentId: string) {
    throw new NotVerifiedError(this.kind, "reportInstallation");
  }

  async abortDeployment(_deploymentId: string) {
    // POST /rest/v1/rollouts/{id}/pause | /stop
    throw new NotVerifiedError(this.kind, "abortDeployment (pause/stop)");
  }
}
