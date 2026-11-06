# FirmwareCouncil — OTA Integrations

FirmwareCouncil is deliberately **not** an OTA provider. This document records
the integration contract with each supported OTA platform and the honest state
of each adapter.

## 1. Integration contract (OTAAdapter interface)

Every adapter implements `packages/shared/ota-adapter.ts`:

```ts
interface OtaAdapter {
  id: "mender" | "hawkbit" | "balena" | "simulator";
  verify(): Promise<AdapterCheck>;            // connectivity + creds sanity
  deviceInventory(ref): Promise<DeviceRecord[]>;
  createDeployment(ref): Promise<DeploymentRef> | YetToVerifyError;
  getDeploymentStatus(ref): Promise<DeploymentStatus | YetToVerifyError>;
  reportInstallation(ref): Promise<InstallationOutcome | YetToVerifyError>;
  abortDeployment(ref): Promise<void>;
}
```

Adapters are enabled per `OTAIntegration` row, which stores only:
provider, credentials key **reference** (never secret material),
sandbox/base URL, and `verified: boolean`.
`Driver status: unverified | verified-lite | verified`

## 2. Mender (primary research target)

- Docs: https://docs.mender.io/api/ (OpenAPI spec:
  https://docs.mender.io/api/openapi.yaml)
- **Auth**: Management APIs use `Authorization: Bearer {jwt}`; JWTs expire in
  a week → CI-style automation must use **personal access tokens** (docs:
  `/server-integration/using-the-apis#personal-access-tokens`). Device APIs use
  `POST /api/devices/v1/authentication/authenticate` to get a device JWT.
- **Inventory**: `GET /api/management/v1/inventory/devices` +
  `GET .../inventory/devices/:id/group`.
- **Deployments**: `POST /api/management/v1/deployments/deployments` creates a
  deployment against filters (`device_group`, artifact name).
- **Status**: device statuses are
  `pending / downloading / installing / rebooting / success / failure` and
  device reports carry `sub_state` (kexec, no-action, already-installed,
  power-hungry-install-in-progress) and `failure_cause` / `transitions`.

### FirmwareCouncil mapping

| FirmwareCouncil concept | Mender concept |
| --- | --- |
| `RolloutStage` | Mender phase/group deployment targeting |
| `InstallationReceipt` | deployment report (status + failure_cause + timestamps) |
| `DeviceFleet` | Mender device group |
| `Release` | Mender Release (named set of artifacts) — **FirmwareCouncil never uploads artifacts itself**; it references an existing artifact_name and binary URL from customer storage |
| Pause/revoke | abort deployment endpoint + artifact blocklist enforced on `POST /deployments` |

**State in this repo:** adapter driver (`apps/api/src/modules/ota/mender.mts`)
implements inventory query, deployment creation, status fetch and abort against
the documented endpoint shapes, driven by env (`MENDER_BASE_URL`,
`MENDER_PAT`, `MENDER_TENANT`). Marked `unverified` until credentials + sandbox
have been exercised (see `INTEGRATION_LIMITATIONS.md`).

## 3. Eclipse hawkBit

- Docs: https://eclipse.dev/hawkbit/
- DDI (device-facing) versus Mgmt API (server-facing).
- **Rollout management** natively models groups + strategies + status
  (`statusCreating`, `statusReady`, `statusRunning`, `statusPaused`,
  `statusStopping`, `statusFinished`) — FirmwareCouncil maps its staged rollout
  windows onto hawkBit rollout groups and uses `pause`/`stop` for incidents.
- Target filtering by `rollout group tags`; actions carry `detailStatus`
  (e.g. `finished`, `pending`, `canceled`, `error`).

**State in this repo:** driver `hawkbit.mts` implements rollout mapping under
the same contract; `unverified`.

## 4. balena

- Docs: https://docs.balena.io/
- Fleet = group of devices pinned to a Release; supports release **freeze**
  to prevent movement, `preemptively blocked releases`, and
  `final releases`. Maps cleanly to FirmwareCouncil `supersede` +
  `rollback-authorise` semantics.

**State in this repo:** driver `balena.mts` implements fleet/release
correlation; `unverified`.

## 5. Simulator (works today, by design)

`packages/device-sim` implements the device side of the **simulator** adapter:
local fleet of devices that continuously:

1. read release metadata from the API,
2. verify the manufacturer signature chain,
3. check compatibility (product line + hardware revision),
4. check revocation state (refuse to install if revoked/unauthorised),
5. install only when the release is `CANARY`/`ROLLOUT`/`DEPLOYED` for the
   device's eligibility window,
6. submit **signed receipts** (Ed25519 device key) with outcome
   (`success`/`failure`), version, digest, timestamps, batch ids,
7. handle offline windows (retry with backoff), and
8. record permanent failures for the incident pipeline.

## 6. Hard rules

1. Firmware binaries never flow through FirmwareCouncil; only digests,
   URLs, and metadata.
2. Adapters never create deployments for releases that have not passed
   the security + operator approval gates.
3. `pauseRelease`/`revokeRelease` are pushed immediately to adapters and
   the adapters' deployment creation is refused while an incident is open.
4. No adapter is marketed as functional before actual credentials + sandbox
   testing (DONE criteria). Mis-scoped claims are tracked as
   `NotVerified` in `apps/api/src/modules/ota/status.mts`.
