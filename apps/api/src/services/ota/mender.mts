import { guardApprovalGate, NotVerifiedError, type AdapterCheck, type AdapterDeploymentRef, type OtaAdapter } from "./contract.mts";

/**
 * Mender adapter — implemented against the documented Management API
 * (https://docs.mender.io/api/). Inventory + deployments + deployment status.
 *
 * STATUS: unverified. Until smoke-tested against a real Mender sandbox with
 * tenant personal access tokens, mutating calls are refused with
 * NotVerifiedError so the product never claims a functional integration it
 * hasn't tested.
 */
export class MenderAdapter implements OtaAdapter {
  kind = "mender" as const;

  constructor(
    private baseUrl: string,      // e.g. https://hosted.mender.io/api/management/v1
    private token: string,        // PAT reference resolved from vault at boot
    private inventoryBase: string // https://hosted.mender.io/api/management/v1/inventory
  ) {}

  async verify(): Promise<AdapterCheck> {
    try {
      const res = await fetch(`${this.baseUrl}/deployments/deployments?size=1`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(8000),
      });
      return {
        ok: res.ok,
        provider: this.kind,
        verified: false, // flip only after a developer confirms full sandbox path
        message: res.ok ? "reachable with configured token (still unverified)" : `HTTP ${res.status}`,
      };
    } catch (err: any) {
      return { ok: false, provider: this.kind, verified: false, message: String(err?.message ?? err) };
    }
  }

  async deviceInventory(_filters: any) {
    const res = await fetch(`${this.inventoryBase}/devices?per_page=100`, {
      headers: { Authorization: `Bearer ${this.token}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new NotVerifiedError(this.kind, `inventory unreachable: HTTP ${res.status}`);
    const devices = await res.json(); // [{ id, group, identity: {...} | null }]
    return (devices as any[]).map((d) => ({
      providerDeviceId: d.id, group: d.group, identity: d.identity,
    }));
  }

  async createDeployment(input: { releaseStatus: string; releaseVersion: string; artifactUrl: string; targetFilter: any }): Promise<AdapterDeploymentRef> {
    guardApprovalGate(input.releaseStatus, this.kind);
    // Documented: POST /api/management/v1/deployments/deployments
    // { name, artifact_name, device_filter: [{ key: "group", value: ... }, ...] }
    throw new NotVerifiedError(this.kind, "createDeployment (needs sandbox smoke test: curl -X POST .../deployments with PAT)");
  }

  async getDeploymentStatus(_deploymentId: string) {
    // GET /api/management/v1/deployments/deployments/:id
    throw new NotVerifiedError(this.kind, "getDeploymentStatus");
  }

  async reportInstallation(_deploymentId: string) {
    throw new NotVerifiedError(this.kind, "reportInstallation");
  }

  async abortDeployment(_deploymentId: string) {
    // POST /api/management/v1/deployments/deployments/:id/abort
    throw new NotVerifiedError(this.kind, "abortDeployment");
  }
}
