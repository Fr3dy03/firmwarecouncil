# FirmwareCouncil — Architecture

FirmwareCouncil is a **release governance layer** that sits between hardware
manufacturers, firmware developers, security reviewers, infrastructure operators,
device fleet managers and OTA deployment platforms. Firmware binaries stay in the
existing OTA/artifact repository; FirmwareCouncil governs **decisions** about them.

## 1. System topology

```
┌────────────────────────────────────────────────────────────────────┐
│                         apps/web (Next.js)                         │
│  Marketing site  (/)      Authenticated control room (/app/*)       │
└──────────────────────────────────┬─────────────────────────────────┘
                                   │ /api/v1 (REST)
┌──────────────────────────────────▼─────────────────────────────────┐
│                        apps/api (Fastify)                          │
│  Auth · Orgs · ProductLines · Releases · ManifestVerification      │
│  SigningKeys · ApprovalWorkflow · RolloutOrchestration             │
│  DeviceFleet · InstallationReceipts · IncidentManagement           │
│  OTAAdapters · Blockchain · Audit                                  │
└──────┬─────────────┬───────────────┬──────────────┬────────────────┘
       │             │               │              │
  Persistence    Redis/BullMQ     OTA adapters    BOT Chain (viem)
  db.json (dev)  jobs/workers     sim|mender|     ReleaseGovernance.sol
  Prisma (prod)                   hawkbit|balena  chain 968 / 677
```

Supporting packages:

| Package | Purpose |
| --- | --- |
| `packages/shared` | Domain types, status machines, BOT chain config, role permissions consumed by web + api |
| `packages/contracts` | ReleaseGovernance.sol (Foundry) — on-chain governance mirror |
| `packages/device-sim` | Device reference agent + simulator: fetches release metadata, verifies signature chain, checks compatibility/revocation, submits signed receipts |
| `packages/deploy` | viem-based deploy + verification scripts for BOT Chain testnet/mainnet |

## 2. Release lifecycle (single source of truth in `packages/shared`)

```
DRAFT ──submit──▶ PROPOSED ──security approve──▶ SECURITY_APPROVED
                      │                              │
        security reject/changes                operator approval
                      │                              │
                      ▼                              ▼
            CHANGES_REQUESTED / REJECTED      CANARY_RUNNING
                                                     │
                                        canary pass  │  canary fail/pause
                                                     ▼
                                            ROLLOUT_IN_PROGRESS ─▶ DEPLOYED
                                                     │
                                   pause / suspend / revoke / rollback
                                                     ▼
                                     PAUSED / REVOKED / SUPERSEDED /
                                     ROLLBACK_AUTHORISED
```

Every transition is written:

1. to **Postgres/file store** (source of truth for the UI),
2. to the **append-only AuditLog**, and
3. to **BOT Chain** via `ReleaseGovernance.sol` (state hashes + decisions).

## 3. Trust boundaries

| Zone | Runs what | Trusts what |
| --- | --- | --- |
| Manufacturer/dev workstation | signing tool or device-sim | its own private Ed25519 key (never leaves) |
| API server | manifest verification, signature chain checks, rule engine | Postgres, Redis, configured RPC |
| Browser | UI, metadata visualisation | API responses only — never executes firmware |
| Device | update client / sim | signed key manifest distributed by API, digest-pin firmware |
| BOT Chain | immutable decision layer | consensus; no external calls from contract |

## 4. Chain strategy (BOT Chain)

- Testnet (968) for CI/demo; mainnet (677) gated behind a readiness review.
- All state reconstruction from **direct `eth_call` reads + receipt lookaps**,
  never from an assumed-open indexer (mainnet `eth_getLogs` is disabled on the
  official RPC). Optional reconciliation worker pulls receipts by stored tx hash.
- Approvals are EIP-712 signed; on-chain `SignatureChecker::isValidSignatureNow`
  verifies *that* the recorded approver actually signed, mirroring backend records.

## 5. OTA integration model

OTAAdapters is a **provider registry**:

| Adapter | Status in v1 | What it does |
| --- | --- | --- |
| `simulator` | **functional** | Full local fleet model, powers the demo/e2e |
| `mender` | interface implemented, flagged unverified | Device inventory, deployment refs, status, installation outcome via Management API (JWT/PA token) |
| `hawkbit` | interface implemented, flagged unverified | Rollout group mapping, DDI status |
| `balena` | interface implemented, flagged unverified | Fleet/release freeze-preempt mapping |

Unverified adapters return `NOT_VERIFIED` metadata and refuse to be promoted to
`verified` until real sandbox credentials have exercised every call path
(see `INTEGRATION_LIMITATIONS.md`).

## 6. Data model (abridged; full schema in `apps/api/prisma/schema.prisma`)

User → OrganisationMember → Organisation → ProductLine → HardwareRevision
→ Release → ReleaseManifest → ReleaseApproval → ReleaseArtifact
→ RolloutPolicy → RolloutStage → DeviceFleet → Device → InstallationReceipt
→ Incident → IncidentComment → OTAIntegration → Transaction → AuditLog
→ SigningKey (Ed25519 public keys, never private material).

## 7. Events and jobs

BullMQ (or in-process runner in dev) handles:

- `blockchain.record` — write governance tx when state changes; retry with
  backoff; store `Transaction` rows with hash + status.
- `blockchain.reconcile` — re-read chain state by tx receipt; alert divergence.
- `receipts.ingest` — verify + persist device receipts in batches.
- `rollout.tick` — advance canary/rollout evaluation windows based on receipts.
- `audit.truncate` — long-term retention policy hook.

## 8. UI architecture (apps/web)

- Next.js App Router. `/` marketing, `/app/*` control room.
- Server components fetch from API via typed client `packages/shared/api-client`.
- `apps/web/components/fc/*` is a bespoke industrial component library
  (release train, status pills, approval timeline, pipeline cards, device
  tables, modal system, incident banners, audit event components).
- Design tokens in `packages/shared/tokens.ts` + `apps/web/styles/tokens.css`
  (single source consumed by both marketing and app).
