# FirmwareCouncil — Research

> Research completed prior to implementation. Every claim below was validated against
> primary vendor documentation or rejected. See `TECHNICAL_REFERENCES.md` for the
> full source list.

## 1. Product space research

### What exists today

| Category | Examples | What they cover | What they do NOT cover |
| --- | --- | --- | --- |
| OTA update security | Uptane (AUTOSAR/IIIT), TUF by The Linux Foundation | Threat-model-driven metadata framework for in-vehicle / device updates; compromise-resilient key hierarchy (root, targets, snapshot, timestamp) | Multi-party *governance*: organisation-to-organisation approvals, accountability, staged rollout policy, incident/rollback coordination |
| Firmware update servers | Mender, Eclipse hawkBit, balena | Device inventories, deployments, artifact hosting, device APIs, deployment Reports | Governance plane: they execute the rollout, they do not record or enforce cross-organisation approval decisions |
| Supply-chain integrity | Sigstore, in-toto, SLSA, SBOM tooling | Artifact provenance chains for CI/CD | Firmware-specific rollout governance, canary policy, device receipt attestation |
| Web3 dashboards | Generic governance / treasury dashboards | Wallet-centric voting UI | Industrial release operations; none model firmware release trains |

**Conclusion:** the defensible product is the *governance layer* between manufacturers,
security reviewers, operators and OTA platforms. FirmwareCouncil does not replace
Uptane/TUF-verified device-side update clients, Mender or hawkBit; it coordinates,
records and enforces decisions about which firmware may be rolled out, and it holds
the audit trail.

### Design influences (industrial UI)

Aviation maintenance operations (job cards, sign-off stamps, release-to-service),
industrial SCADA control rooms (dense operational tables, unambiguous status
semantics, horizontal process flows), enterprise DevSecOps release management.
Reference palette deliberately avoids neon/crypto aesthetics; IBM Plex typography.

## 2. BOT Chain (Bohr) — validated

Verified on 2026-11-06 against dev-docs.botchain.ai and live RPC calls:

| Item | Value | Validation |
| --- | --- | --- |
| Testnet chain ID | **968** (`0x3c8`) | Live `eth_chainId` on `https://rpc.bohr.life` returned `0x3c8` |
| Testnet RPC | `https://rpc.bohr.life` | Live; Geth-compatible |
| Testnet explorer | `https://scan.bohr.life/` | Official docs |
| Mainnet chain ID | **677** | Official docs + chainlist.org/chain/677 |
| Mainnet RPC | `https://rpc.botchain.ai` | Official docs |
| Mainnet explorer | `https://scan.botchain.ai/` | Official docs |
| Native token | BOT (tBOT on testnet), 150M supply | Official docs |
| Faucet | `https://faucet.botchain.ai/basic` | Official docs |
| Compatibility | Ethereum/Geth-compatible JSON-RPC; Foundry, viem, ethers all work | Official docs |

### Critical limitation: `eth_getLogs` on mainnet

The official JSON-RPC page states: *"eth_getLogs is disabled on [mainnet endpoints].
Please use 3rd party endpoints… If you need to pull logs frequently, we recommend
using WebSockets."*

**Architectural consequence (design decision FRC-D01):** FirmwareCouncil's release
history must never depend on unrestricted log indexing on mainnet. The platform:

1. Uses **direct contract reads** (`eth_call`) keyed by release/product IDs for all
   state reconstruction;
2. Persists **transaction hashes and receipts** at write time in its own backend
   (`Transaction` table) and reconciles against `eth_getTransactionReceipt`;
3. Runs **reconciliation jobs** that re-derive on-chain state into Postgres;
4. Ships an optional **WebSocket subscription worker** for real-time event push;
5. Allows an explicitly configured, separately verified indexing provider as a
   best-effort accelerator — but never as the source of truth.

On testnet `eth_getLogs` is available and is used by the reconciliation job, but
production mainnet config must not rely on it.

**Live probe addendum (2026-11-06, deployment phase):** a direct probe of
`https://rpc.botchain.ai` (chainId 677) returned successful results for
**bounded-range** `eth_getLogs` (e.g. blocks 0x1–0x2 and 0x0–100,000), while a
**full-range** query (`fromBlock 0x0 → latest`) timed out after HTTP timeout.
Measured behaviour is therefore consistent with the official guidance: mainnet
log queries are feasible only for narrow ranges and must not be used as a
release-history source. FRC-D01 (never build history from unrestricted log
indexing) is re-affirmed unchanged; `packages/deploy/src/check.mts` reports the
measured behaviour on every run so drift is caught, not assumed away.

## 3. Firmware security research

### Uptane / TUF

Key findings incorporated into the design:

- **Key hierarchy isolation.** Compromise-resilient separation of root /
  targets / snapshot / timestamp keys maps in FirmwareCouncil to: organisation
  signing keys (targets), platform root of trust (root), and boardkeys.
  A single untrusted actor can never authorise a release.
- **Offline trusted root.** Devices must trust the initial root out-of-band and
  verify subsequent metadata against it — the device reference agent verifies the
  manufacturer signature chain against keys anchored by the backend's
  signed key manifest, and checks a freshness window (snapshot timestamps).
- **Rollback defense via version pinning.** Files never downgrade below the
  last-verified version; the agent refuses installs whose release version is
  not authorised for the device.
- **Revocation lifecycle.** Key and release revocation must propagate to devices;
  the release must be marked revoked *before* the agent treats anything as trusted.

### Reference designers

- **Mender** — Management API (JWT bearer auth, personal access tokens for
  CI/CD), Device APIs (deployments, inventory, artifact list), deployment status
  reporting model: `pending / downloading / installing / rebooting / success /
  failure` (with `failure_cause`, `transitions`). The FirmwareCouncil Mender
  adapter maps these endpoints to device inventory, deployment references and
  installation receipts. Device-auth endpoint issues per-device JWTs — production
  adapter must store tenant tokens in Vault, never in the database.
- **hawkBit** — DDI/DMF device interfaces, rollout management with *action
  groups*, *rollout strategies*, and pause/resume semantics close to
  FirmwareCouncil's staged rollout. Statuses: `statusCreating`, `statusReady`,
  `statusRunning`, `statusPaused`, `statusStopping`, `statusFinished`.
- **balena** — fleet-and-release model: every device is in a fleet, fleets track
  a release; supports freezing/preempting releases. Good model reference for
  fleet-level roll-forward/roll-back, less useful as an on-prem governance
  anchor.

## 4. Blockchain design research

- Solidity `0.8.x` checked arithmetic + custom errors (no compiler-added error
  signature collisions with OZ), pinned OpenZeppelin (`AccessControl`,
  `EnumerableSet`, `ReentrancyGuard`, `SignatureChecker`, `EIP712`,
  `Pausable`). No upgradeability for v1 in-contract; deployment scripts allow
  either direct or proxied deployment without OZ-upgrade boilerplate.
- EIP-712 typed signing for release approvals so decisions are bound to
  `releaseId`, `role`, `decision` and `nonce` (replay protection).
- Release version uniqueness enforced with a keccak256 digest set
  (`releaseKey = keccak(productLineId, versionHash)`) — collided versions are
  rejected on-chain.
- Receipts committed as Merkle roots of installation batches (`recordBatchReceipt`)
  to keep gas low for fleet-scale acknowledgements.

## 5. Competitive/differentiation summary

| Claim | Evidence in this repo |
| --- | --- |
| Multi-party governance, not single-signer OTA | `ReleaseGovernance.sol`: MANUFACTURER proposes, SECURITY_REVIEWER approves, OPERATOR authorises rollout — all three roles gate progress |
| Governance over OTA platforms, not instead of them | `apps/api/src/modules/ota/*`: adapters to Mender/hawkBit/simulator; releases store digests + URLs, never binaries |
| Trustworthy on BOT Chain | `EGovernance.sol` deployed scripts + `docs/DEPLOYMENT_UNITS.md`-style runbooks; package `packages/deploy` (viem, chain 968) |
| Full auditability | Append-only `AuditLog` + per-decision `ReleaseApproval` records with timestamps, digests and EIP-712 signature references |
| Real device innocence | `packages/device-sim`: verifies signature chain + compatibility, refuses unauthorised/revoked releases, submits signed receipts |
