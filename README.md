# FirmwareCouncil

Multi-party firmware release governance — an approval, rollout-oversight and audit layer that sits **on top of** an existing OTA platform (Mender, HawkBit, Balena, or the included device simulator). FirmwareCouncil does **not** host, sign or serve firmware artifacts; it governs the **decision record**: who approved what, with which signature, what the canary showed, who advanced/paused/rolled back — every step evidence-chained and mirrored to **BOT Chain** (Bohr), chainId 677 mainnet / 968 testnet.

> **"Software releases need more than a signature."** — firmware releases require a *council*: a manufacturer proposing, a security reviewer verifying, a fleet operator authorising staged deployment, and an honest audit chain when something goes wrong.

## What is actually implemented

| Area | Status |
| --- | --- |
| Governance contract (`packages/contracts`) | **Complete** — Foundry + OpenZeppelin v5, 22/22 forge tests passing |
| Backend API (`apps/api`) | **Complete** — Fastify, JSON-file store (Prisma schema included for Postgres production), full `/api/v1` surface |
| Audit chain | **Complete** — hash-chained audit events, chain verified client + server-side |
| Web (marketing + control room) | **Complete** — Next.js 15: 12 marketing routes + `/app/*` role-scoped control room |
| Device simulator (`packages/device-sim`) | **Complete** — pinned-key artifact verification, compatibility check, revocation check, rollback defense, signed receipts |
| OTA adapters | **Honest** — simulator adapter functional end-to-end; Mender/HawkBit/Balena are shape-only adapters that *refuse to verify* until sandbox testing is done (see INTEGRATION_LIMITATIONS) |
| BOT Chain deployment (`packages/deploy`) | **Complete tooling** — `check` + `deploy` scripts; a live deployment requires a funded tBOT key from the official faucet |
| E2E governance suite | **Passing** — propose → sign → reviews → canary → staged rollout → deploy, plus deliberate negative/security cases |

## Quickstart

```bash
npm install                       # workspaces install
npm run test:contracts            # forge test (22 tests)   [requires foundry]
npm run seed                      # demo organisations, users, keys, devices + db.json
npm run dev                       # api :4100 + web :4300
node apps/api/scripts/e2e.mts     # full governance e2e (reseeds itself)
npm run test                      # api e2e suite + device-sim unit tests
```

Sign in at `http://localhost:4300/sign-in` with the seeded demo identities:

| Role | Email | Password |
| --- | --- | --- |
| Manufacturer | `dev@ardane.example` | `maker-demo-pass` |
| Security reviewer | `review@sentinel.example` | `security-demo-pass` |
| Fleet operator | `ops@voltridge.example` | `operator-demo-pass` |
| Platform admin | `admin@firmwarecouncil.example` | `platform-demo-pass` |

**Governing workflow to try:** sign in as the manufacturer and walk the 10-step release wizard (`/app/releases/new`), then as the security reviewer approve it, then as the operator open the canary and advance the staged rollout — the Release Train on the release detail page moves with every decision.

## Repository layout

```
packages/shared       domain types, BOT Chain config (968/677), workflow state machine, design tokens
packages/contracts    ReleaseGovernance.sol (Foundry/OZ 5.1), 22 tests, deploy script
packages/device-sim   device reference agent + Ed25519 receipt signing keys
packages/deploy       BOT Chain network check + viem deploy harness
apps/api              Fastify :4100 — auth, orgs, product lines, releases, approvals,
                      rollouts, fleets, devices+receipts, incidents, keys, integrations, audit
apps/web              Next.js :4300 — marketing site + /app control room
docs/                 RESEARCH, TECHNICAL_REFERENCES, ARCHITECTURE, SECURITY_MODEL,
                      OTA_INTEGRATIONS, KNOWN_LIMITATIONS
```

## BOT Chain

- Testnet: chainId **968**, RPC `https://rpc.bohr.life`, explorer `https://scan.bohr.life/`, faucet `https://faucet.botchain.ai/basic`
- Mainnet: chainId **677**, RPC `https://rpc.botchain.ai`, explorer `https://scan.botchain.ai/`
- Architecture rule **FRC-D01**: release history is never built from unrestricted `eth_getLogs` on mainnet; direct contract reads + stored transaction receipts + reconciliation jobs only (measured behaviour documented in `docs/RESEARCH.md`).

Deployment tooling:

```bash
npm run check  -w @fc/deploy      # live RPC chainId/block head/deployer balance probe
npm run deploy -w @fc/deploy      # viem deployment of ReleaseGovernance (requires funded key)
npm run deploy:forge -w @fc/deploy
```

Without `GOV_CONTRACT_ADDRESS` + `GOV_PRIVATE_KEY`, the governance **mirror** records every event with status `ANNOUNCED` and an explicit "not broadcast" reason — the workflow still functions; hashes are never fabricated.

## Documentation

Start with `docs/RESEARCH.md` (why this exists, BOT Chain validation, Uptane/TUF lineage), then `docs/ARCHITECTURE.md` (data model + state machine), `docs/SECURITY_MODEL.md` (threat model), `docs/OTA_INTEGRATIONS.md` (what is verified vs not), `docs/KNOWN_LIMITATIONS.md` (the honest list). `SECURITY.md` covers vulnerability reporting; `INTEGRATION_LIMITATIONS.md` the integration caveats.
