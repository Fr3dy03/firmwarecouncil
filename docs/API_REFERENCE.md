# FirmwareCouncil — API reference (v1)

All endpoints live under `/api/v1` on the API server (`:4100` direct, or `:4300/api/v1/*` via the web proxy rewrite). Auth uses `Authorization: Bearer <session token>` from `POST /auth/login`. Errors are `{ "error": { "code": string, "message": string } }` with correct HTTP status. Every state-changing action appends a hash-chained audit event.

## Auth & orgs

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` | body `{ email, password }` → `{ token, user }` |
| POST | `/auth/logout` | revokes the presented session (server-side nonce) |
| GET | `/auth/me` | `{ user: SessionUser }` |
| GET | `/users` | platform-admin scope |
| POST | `/invitations` | platform-admin: invite `{ email, role, organisationId }` |
| GET | `/organisations` | all orgs (id, name, type) |
| GET | `/status` | API + chain mirror status (`broadcastCapable`, contract, chainId) |

## Product lines

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/product-lines` | list (with hardware revisions) |
| POST | `/product-lines` | manufacturer: create (name, productName, defaultArchitecture, bootloaderRequirements, otaProviderId, compatibilityPolicy, supportedFirmwareVersions, hardwareRevisions) |
| GET | `/product-lines/:id` | detail |

## Releases (governance)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/releases` | list; records carry `manifest`, and id/`releaseId` aliases |
| POST | `/releases` | propose — body per `apps/api/scripts/e2e.mts` (productLineId, version, buildIdentifier, artifact digests/size/url, securityNotes, targetRevisions, previousReleaseId) |
| GET | `/releases/:id` | detail: manifest, approvals, rollout state, incidents |
| GET | `/releases/:id/pipeline` | release-train steps + pipeline/progress for UI |
| POST | `/releases/:id/signature` | manufacturer signing step |
| POST | `/releases/:id/approve` \| `/reject` \| `/request-changes` | decision `{ comments, signatureDigest }`; the digest binds the decision (see e2e helper convention) |
| POST | `/releases/:id/rollout` | rollout actions: open canary, record canary result, advance/pause/resume, rollback `{ action, ... }` — canonical action names in `apps/api/src/routes/index.mts` |

## Fleets & devices

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/fleets` | list |
| GET | `/fleets/:id` | detail incl. devices |
| GET | `/devices` | list (query filters supported by routes) |
| POST | `/devices` | register device |
| POST | `/devices/:id/receipts` | device-signed installation receipt (fail-closed verification) |
| GET | `/devices/:id/receipts` | receipt history |

## Incidents

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/incidents` · `GET /incidents/:id` | list/detail |
| POST | `/incidents` | open incident |
| POST | `/incidents/:id` | update status/severity/corrective action |
| POST | `/incidents/:id/comments` | append comment |

## Signing keys & integration

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/keys` | org's historical keys (public material only — never private keys) |
| POST | `/keys` | register public Ed25519 key `{ label, publicKey, ... }` |
| POST | `/keys/:id/rotate` · `/keys/:id/revoke` | lifecycle |
| GET | `/keys/manifest` | verified key manifest digest |
| GET | `/integrations` | adapter config + verified flag |
| POST | `/integrations/:id/verify` | sandbox smoke test; non-simulator adapters honestly fail verification (`INTEGRATION_LIMITATIONS.md`) |

## Audit & health

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/audit?limit=N` | hash-chained audit events (sequence, prevHash, hash) |
| GET | `/status` | chain mirror status |
| GET | `/health` | liveness |

Canonical usage examples (request bodies, digest conventions, expected sequences) live in `apps/api/scripts/e2e.mts` — that file is kept executable, so it may never drift from the API.
