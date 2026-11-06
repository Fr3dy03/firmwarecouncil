import { JsonStore } from "../store.mts";
import { guardApprovalGate, type AdapterCheck, type AdapterDeploymentRef, type OtaAdapter } from "./contract.mts";

/**
 * Simulator adapter — the reference OTA integration. Fully functional: it
 * models device inventory, deployment refs, deployment statuses and
 * installation outcomes locally so the whole governance loop can be
 * exercised end-to-end without external credentials.
 */
export class SimulatorAdapter implements OtaAdapter {
  kind = "simulator" as const;

  constructor(private store: JsonStore) {}

  async verify(): Promise<AdapterCheck> {
    return { ok: true, provider: this.kind, message: "simulator ready", verified: true };
  }

  async deviceInventory(filters: { productLineId?: string; fleetId?: string }) {
    return this.store.filter("devices", (d) =>
      (!filters.fleetId || d.fleetId === filters.fleetId) &&
      (!filters.productLineId || d.productLineId === filters.productLineId));
  }

  async createDeployment(input: { releaseStatus: string; releaseVersion: string; artifactUrl: string; targetFilter: any }): Promise<AdapterDeploymentRef> {
    guardApprovalGate(input.releaseStatus, this.kind);
    const ref = this.store.put("items", { pending: false });
    this.store.remove("items", ref.id);
    return { id: `dep_${Date.now().toString(36)}`, provider: this.kind, createdAt: new Date().toISOString() };
  }

  async getDeploymentStatus(deploymentId: string) {
    return { deploymentId, status: "RUNNING", detailStatus: "downloading" };
  }

  async reportInstallation(deploymentId: string) {
    return { deploymentId, outcome: "SUCCESS" };
  }

  async abortDeployment(deploymentId: string) {
    return true;
  }
}
