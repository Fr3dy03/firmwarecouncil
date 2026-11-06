# INTEGRATION LIMITATIONS — FirmwareCouncil

Status of every external integration in this build, stated plainly. The principle: **an integration is not "supported" until it has been verified in a sandbox against a live system.** Shape-only adapters refuse to claim verification.

## Verified

| Integration | Verified against | Notes |
| --- | --- | --- |
| BOT Chain testnet RPC | `https://rpc.bohr.life` (chainId 968) — `eth_chainId`, block head, tx fee estimation | `packages/deploy/src/check.mts` re-probes on every run |
| BOT Chain mainnet RPC | `https://rpc.botchain.ai` (chainId 677) — `eth_chainId`, block head; bounded `eth_getLogs` (0…100k) answered; full-range times out | See `docs/RESEARCH.md` addendum; never a history source (FRC-D01) |
| Device simulator OTA adapter | Full loop: manifest fetch → digest verify → install → Ed25519-signed receipt → backend acceptance | `packages/device-sim/src/agent.mts`; receipts verified with pinned Ed25519 keys |

## Shape-only (explicitly NOT verified)

These adapters implement the expected request/response **shape** of the target platform and are wired for configuration, but have **not** been exercised against a live Mender / HawkBit / Balena instance. Every code path that would contact them is guarded by a `NotVerifiedError` — the API surfaces an honest error instead of pretending success.

| Adapter | Intended target | Missing before "verified" |
| --- | --- | --- |
| `mender` | Mender deployments API | Sandbox tenant; deployment artifact map; webhook auth; rate-limit handling |
| `hawkbit` | Eclipse HawkBit DDI/Mgmt API | Tenant config; roll-out group semantics; controller auth tokens |
| `balena` | BalenaCloud releases | Device API scoping; supervisor state reconciliation |

## Chains

- **No mainnet deployment exists in this build.** Deployment tooling (`packages/deploy`) is complete and honest, but a live contract requires a funded tBOT key; without it the governance mirror records `ANNOUNCED` events with the reason "not broadcast". The UI never displays ANNOUNCED transactions as chain-confirmed.
- Mainnet `eth_getLogs` must not be used for history reconstruction per FRC-D01 — measure, don't assume (the check script re-measures each run).

## Auth & hosting assumptions in this build

- Sessions are HMAC-signed bearer tokens with server-side nonce revocation, backed by a JSON file store — **not** an identity provider. Production per `docs/SECURITY_MODEL.md`: SSO, MFA, Postgres, secrets in a vault.
- Device receipt keys are Ed25519, provisioned via seeding for the demo (`packages/device-sim/keys`); real fleets need a hardware-backed key provisioning ceremony.
- Demo artifacts point at a local URL namespace; real deployments must pin external, access-controlled artifact repositories (digests are verified by devices regardless of hosting).

## Contact

Integration questions: see `docs/OTA_INTEGRATIONS.md` for the design contract each adapter must satisfy before verification, and `SECURITY.md` for reporting.
