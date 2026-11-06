# FirmwareCouncil — Technical References

Primary sources consulted during research and implementation. All were retrieved
and read on 2026-11-06.

## BOT Chain (Bohr) — official

| Resource | URL | Used for |
| --- | --- | --- |
| BOT Chain developer intro | https://dev-docs.botchain.ai/docs/intro/ | Product positioning |
| Quick guide | https://dev-docs.botchain.ai/docs/Developers/quick-guide/ | Chain IDs, RPCs, faucet, tooling matrix |
| JSON-RPC endpoints | https://dev-docs.botchain.ai/docs/Developers/json-rpc-endpoint/ | **Mainnet `eth_getLogs` disabled** — drives architecture decision FRC-D01 |
| Node configuration best practices | https://dev-docs.botchain.ai/docs/Developers/bot-chain-node-configuration-best-practices/ | Hardware sizing, sentry nodes, RPC exposure policy for self-hosted infra |
| Node types | https://dev-docs.botchain.ai/docs/Developers/node-types/ | Fast/full/archive node selection for the optional indexer |
| Official GitHub (bl-BOHR) | https://github.com/bl-BOHR | Node deploy scripts, geth-grade compatibility |
| Main website | https://www.botchain.ai/en/ | Branding, ecosystem entry point |
| Project (ecosystem) directory | https://www.botchain.ai/en/project-party/ | Ecosystem listing target |
| Ecosystem support | https://www.botchain.ai/en/ecosystem-support/ | Grant/apply path noted in README |
| BOT Chain brand kit (zip) | https://www.botchain.ai/static/BOT%20Chain%20Assets/BOT%20Chain%20Brand%20Kit.zip | Downloaded, extracted `BOT Chain.svg` — used verbatim in footers |
| BOT Chain brand guideline (pdf) | https://www.botchain.ai/static/BOT%20Chain%20Assets/BOT%20Chain%20Brand%20Guideline.pdf | Logo usage rules read before employing the SVG |
| Testnet faucet | https://faucet.botchain.ai/basic | tBOT for deployment |
| Chainlist entry | https://chainlist.org/chain/677 | Mainnet chain ID cross-check |

## Firmware security

| Resource | URL | Used for |
| --- | --- | --- |
| Uptane standard (source of truth) | https://github.com/uptane/uptane-standard/blob/master/uptane-standard.md | Metadata format, key hierarchy, resilience rules |
| The Update Framework docs | https://theupdateframework.io/docs/ | Threat model: replay, rollback, freeze, mixed-system attacks |
| TUF specification | https://theupdateframework.io/spec/ | Metadata lifecycle; informed the manifest schema |
| TUF security properties | https://theupdateframework.io/docs/security/ | Explicit security property checklist used in SECURITY_MODEL.md |
| Mender docs | https://docs.mender.io/ | Deployment model, inventory roles |
| Mender API reference | https://docs.mender.io/api/ | Management + device APIs, JWT auth, deployment status vocabulary |
| Eclipse hawkBit | https://eclipse.dev/hawkbit/ | Rollout groups, pause/stop semantics referenced by RolloutOrchestration |
| balena docs | https://docs.balena.io/ | Fleet↔release model, release freezing policy concepts |

## Development stack

| Resource | URL | Used for |
| --- | --- | --- |
| Solidity | https://docs.soliditylang.org/ | 0.8.x language, custom errors |
| OpenZeppelin Contracts | https://docs.openzeppelin.com/contracts/ | AccessControl, SignatureChecker, ReentrancyGuard, Pausable |
| Foundry | https://book.getfoundry.sh/ | Contract build + test engine (forge 1.8.1 used locally) |
| viem | https://viem.sh/ | Deployment + contract read/write clients (chain 968) |
| Next.js | https://nextjs.org/docs | App Router structure, route handlers |
| PostgreSQL | https://www.postgresql.org/docs/ | Production persistence (Prisma schema in `apps/api/prisma/`) |
| Redis | https://redis.io/docs/ | Job queue channel (BullMQ presence in deployment, optional in-memory fallback) |

> Version pinning: exact dependency versions live in each workspace
> `package.json`. Foundry libraries are pinned in `contracts/foundry.toml`
> via `lib/` git submodules.
