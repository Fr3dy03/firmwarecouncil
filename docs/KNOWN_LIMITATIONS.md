# FirmwareCouncil — Known Limitations & INTEGRATION_LIMITATIONS

The spec asks what is **not yet** working. Being precise here is part of the
security posture of a release-governance product.

## 1. Chain deployment

- **Testnet contract deployment happened via `packages/deploy` only when a
  funded private key is supplied** (`DEPLOY_PRIVATE_KEY` in `.env`).
  Without tBOT from the official faucet
  (https://faucet.botchain.ai/basic) the deploy script exits with a
  clear funding message instead of a fake, fake-like, or stale contract.
- **When tBOT is present**: `packages/deploy` resolves the release, pins
  `ReleaseGovernance.sol`, deploys with viem (chainId 968), and writes
  `contracts/deployments/{chainId}.json` (address, tx hash, ABI path) which
  the backend reads at boot; no re-deploy needed.
- **Mainnet** is gated behind readiness review (see `MAINNET_READINESS.md`);
  the same script advances chainId 677 only after an explicit opt-in flag.

## 2. OTA integrations

| Adapter | Inventory | Create deployment | Status | Abort | Verdict |
| --- | --- | --- | --- | --- | --- |
| simulator | ✅ | ✅ | ✅ | ✅ | **functional (local demo)** |
| mender | shape implemented | shape implemented | shape implemented | shape implemented | **unverified** — no sandbox credentials in CI |
| hawkbit | shape implemented | shape implemented | shape implemented | shape implemented | **unverified** |
| balena | shape implemented | ❌ (fleet model differs) | shape implemented | shape implemented | **unverified** |

All three are marked `NotVerified` and refuse to be surfaced in the product UI
as productive integrations until smoke-tested with real credentials. The
product surfaces a yellow "unverified integration" badge for them.

## 3. Persistence

- Default dev mode uses a **file-backed JSON store** (`apps/api/data/db.json`)
  for instant local start-up and deterministic integration tests.
  - Prisma schema (`apps/api/prisma/schema.prisma`) + migrations target Postgres
    for production; a `.env` with `DATABASE_URL` switches the store. The store
    interface (`StorageAdapter`) is identical, so no product code branches.
- Redis/BullMQ is **optional** in development (in-process queue runner);
  production deployment wire `REDIS_URL` for horizontal worker scaling.

## 4. Authentication

- Demo deployments seed demo orgs with shared demo passwords; a real
  deployment **must** change these (`SEED_DEMO=false`) and enforce MFA/
  SSO which v1 does **not** implement. Cookie signing key rotation and CSRF
  double-submit exist; hardware-bound sessions (FIDO2) are roadmap.

## 5. Governance contract scope

- `ReleaseGovernance.sol` records the **decision trail and state hashes**;
  full raw manifests are stored off-chain in Postgres/file store. Manifest
  tamper-evidence is the digest + EIP-712 signature of the canonical manifest.
- No upgradeability in-contract for v1 (deliberate — see SECURITY_MODEL.md
  §3.6); deploying via OZ-UUPS `TransparentUpgradeable` proxy is available
  but opt-in.

## 6. Device agent scope

- The reference agent implements signature/compatibility/revocation checks and
  signed receipts but is **not** a bootloader replacement; it's an
  instrumentation harness to validate FirmwareCouncil's contract with real
  Uptane-style updaters. Real device firmware rollout runs through Mender/
  hawkBit/balena, not through this repo.

## 7. Testing coverage gaps

- Frontend visual regression is manual (no Playwright screenshots in CI).
- fuzzing coverage of `ReleaseGovernance.sol` is targeted (foundry invariants
  exist) but not exhaustive.
- Load testing (receipt ingestion at fleet scale) is unimplemented.

## 8. Broadcast mirror — current shape (working, with documented caveats)

The testnet mirror completes the full workflow end to end (see the run log in
`docs/SECURITY_RUNBOOK.md`): `RELEASE_PROPOSED → RELEASE_APPROVED (×2) →
CANARY_OPENED → CANARY_RESULT → ROLLOUT_AUTHORISED → ROLLOUT_ADVANCED (×4)`,
17/17 records `CONFIRMED` with sequential block anchors on chain 968. Three
deliberate design points to be aware of:

- **Relay-signer model.** The broadcaster key (`GOV_PRIVATE_KEY`) holds the
  operational roles and pays gas; the operator/security decision signers
  (`GOV_OPERATOR_SIGNER_KEY`, `GOV_SECURITY_SIGNER_KEY`) are registered
  on-chain via `registerSigner` and are **pure signing identities with no
  funds**. In a production deployment those two keys belong to the human
  approvers (kept in HSMs/never on the server); the demo holds them server-side
  only to exercise the full EIP-712 path.
- **Request-changes decisions are not broadcast.** The deployed contract v1 has
  only a terminal `rejectRelease`; a "request changes" review outcome has no
  on-chain writer, so the mirror records it honestly as `ANNOUNCED` with an
  explicit `reason` instead of pretending it anchored. On-chain parity will
  come with the v2 contract writer (`setChangesRequested`).
- **`finaliseDeploy` is not mirrored yet.** The chain record currently ends at
  the `RolloutRunning` stage-4 advance; the app-level `DEPLOYED` transition
  (rollout completion) is app-state only until the final-stage writer is
  wired, and is listed as the next mirror milestone.

## 9. Diagnostics kept in-repo

`contracts/src/ProbeDomain.sol` (deployed at
`0x0f34e83d268c84a4e3cbd711e0eed013f679b6d6` on testnet 968) is a
**diagnostic-only** contract exposing OZ's `_domainSeparatorV4`, the approval
struct hash and an ECDSA recover, used to bisect a signature mismatch. The
debugging result is preserved in the mirror: `blockchain.mts` never uses
`account.signTypedData` directly — that path produced a digest divergent from
its own `hashTypedData` under this viem/toolchain combination (local recovery
returned a different address). Instead the mirror hashes with `hashTypedData`,
self-checks `recoverAddress` against the signer, then signs the raw digest
(`signer.sign({ hash })`) — deterministic and provably matching OZ's
`ECDSA.recover` on-chain.
