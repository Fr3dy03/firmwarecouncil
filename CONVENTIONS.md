# Repository Conventions (agents: read me before writing code)

## Layout

- `packages/shared` — domain types (`src/types.ts`), BOT chain config (`src/chain.ts`,
  CHAIN IDs: testnet 968 rpc https://rpc.bohr.life ; mainnet 677 rpc https://rpc.botchain.ai),
  status helpers (`src/workflow.ts`), design tokens (`src/tokens.ts`).
- `packages/contracts` — Foundry. `src/ReleaseGovernance.sol`, `test/`, `script/`.
- `apps/api` — Fastify (NodeNext, `.mts` files) on port **4100**, all routes under `/api/v1`.
- `apps/web` — Next.js App Router on **4300**. Marketing at `/`, control room at `/app/*`.
- `packages/device-sim` — device reference agent (CLI + library).
- `packages/deploy` — viem deploy scripts for BOT Chain.
- `docs/` — product documentation.

## Language rules

- TypeScript strict, NodeNext modules (`import x from "./x.js"` with explicit .js extension
  inside packages/shared + api; in apps/web use relative imports without extension per Next
  conventions).
- Apps/API persistence: `apps/api/src/services/store.mts` (JSON file store implementing a
  `Storage` interface mirroring the Prisma schema). Never invent new persistence.
- No database passwords, no real chain private keys committed anywhere.

## Design system (both marketing + app)

- Import tokens from `apps/web/styles/tokens.css` variables (`--fc-*`).
- Typography: IBM Plex Sans for UI, IBM Plex Mono for hashes/versions/device refs/
  key ids/tx refs. Load Plex from `next/font/google` with subsets ["latin"] and
  weights [400,500,600].
- Component library lives in `apps/web/components/fc/*`; export patterns:
  named exports, no default exports except `page.tsx` files.
- Status colours come from `packages/shared/src/tokens.ts` STATUS_COLOR.
- No neon, no crypto gradients, no decorative dashboards. Precise 12-column-ish
  grid alignment, dense tables, generous whitespace between sections.

## API conventions

- All routes under `/api/v1/...`, auth via `Authorization: Bearer <session token>`
  (demo sessions seeded by `npm run seed`).
- Standard errors: `{ error: { code: string, message: string } }` with proper HTTP codes.
- Every state-changing action appends to the audit trail (see `apps/api/src/services/audit.mts`).
