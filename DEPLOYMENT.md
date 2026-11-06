# FirmwareCouncil — Vercel deployment

The repo is prepared so that after `git push`, you can import it on
[vercel.com](https://vercel.com) and add the project env vars — no CLI
required. The web app is a standard Next.js project; the Fastify API stays on
its own host and is proxied via the `/api/v1/:path*` rewrite
(`apps/web/next.config.mjs`).

## 1. What gets deployed by default

| Piece | Vercel |
| --- | --- |
| `@fc/web` (marketing + `/app` control room) | Yes — import the repo, see below |
| `@fc/api` (Fastify, in-memory JSON store, on-chain mirroring) | **No** — deploy `apps/api` separately (Render/Railway/Fly/any Docker host) or leave it pointing at your local machine while you demo; set `FC_API_URL` accordingly |
| Contracts / deploy scripts | Not deployed by Vercel |

Vercel builds from the repo root with the workspaces install. Configuration
is in `vercel.json` at the root; when importing, set **Root Directory =
`apps/web`** and it picks up the same settings.

## 2. Import steps (Git push → Vercel)

1. `git push` the repo (and any newer commits) to GitHub/YOUR_GIT_HOST.
2. On vercel.com → **Add New → Project** → import the repository.
3. The root `vercel.json` is applied automatically (monorepo manager,
   `npm install`, build order `shared → web`, `apps/web/.next` output).
4. Add the project environment variables (step 3 below) under
   **Settings → Environment Variables**.
5. **Deploy.** Every subsequent `git push` redeploys automatically.

## 3. Environment variables to add (Vercel → Settings → Env Vars)

Web project:

- `FC_API_URL` — **required.** Public origin of the API, e.g.
  `https://your-api-host` (no trailing path). Used by the
  `/api/v1/*` → API rewrite. Change it, then redeploy.
- `NEXT_PUBLIC_SITE_URL` — optional; if unset, the site uses the Vercel
  deployment hostname.

API service (if/when you deploy it):

- `PORT`, `AUTH_SECRET` (32-byte hex — generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
  `SEED_DEMO=true` (dev seed; must be `false` in any non-demo), plus the
  blockchain mirror keys from the root `.env.example`.

For the demo seed to work on the deployed web app, sign in with the
documented demo accounts (`dev@ardane.example` / `maker-demo-pass`, plus the
security/operator/flleet demo identities) — see
`apps/api/scripts/seed.mts` and `docs/SECURITY_RUNBOOK.md`.

## 4. Known deployment caveats (read before demoing)

- **Marketing + `/app` shell render statically; control-room data is fetched
  client-side** through the API proxy. If `FC_API_URL` is wrong or the API is
  unreachable, the control room shows its error/empty states, not a blank
  page.
- **Concatenated root builds are slower** than the `Root Directory =
  `apps/web` path — if your install fails with timeouts, set Root
  Directory explicitly and use the root `vercel.json` values verbatim.
- **Larger Next.js versions / node pins**: `.nvmrc` pins Node 24; Vercel
  honours it automatically.
- **Demo data resets on API restart** (in-memory JSON store) — releases and
  the on-chain mirror anchors derive lazily, so reset releases re-anchor
  idempotently; see `docs/KNOWN_LIMITATIONS.md` §8.

## 5. Optional: single-project alternative (same origin, no separate API host)

Deploy the API as a Vercel **serverless function** alongside the web app:
move an `api/index.ts` (Fastify) function entry under `apps/api/api/`,
set `functions` output config in `apps/api/vercel.json`, and replace the
Next rewrite with an internal target. Trade-offs: serverless filesystem is
read-only apart from `/tmp` (the dev JSON store must live in `/tmp`, i.e.
state resets on each cold start), and 10 s/60 s function timeouts limit long
on-chain broadcast awaits. The two-service setup above is recommended for
the demo because the API's persistence and broadcast queue assume a long-lived
process.
