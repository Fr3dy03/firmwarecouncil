# Security Policy — FirmwareCouncil

## Supported components

| Component | Path | Support |
| --- | --- | --- |
| Governance contract | `packages/contracts/src/ReleaseGovernance.sol` | Audited-by-tests only — **external audit is required before any mainnet deployment** |
| Backend API | `apps/api` | Actively developed |
| Device agent | `packages/device-sim/src/agent.mts` | Reference implementation |
| Web | `apps/web` | Actively developed |

## Reporting a vulnerability

**Do not open a public issue.**

1. Email `security@firmwarecouncil.example` (PGP key fingerprint published at `/security.txt` on the deployment) with:
   - affected component and commit hash,
   - minimal reproduction,
   - your assessment of impact and whether any real funds/artifacts are at risk.
2. Expect acknowledgement within **5 business days**, a triage status within **20 business days**.
3. We follow coordinated disclosure: credit by handle unless you request otherwise; **no bounties** are offered for this internal build.
4. Do not exploit against production deployments and do not exfiltrate/modify any real data outside your own local instance.

## Testing your own instance safely

```bash
npm run seed && npm run dev      # local demo instance on :4100/:4300 — attack freely
forge test --root contracts      # contract-level security suite (22 tests)
node apps/api/scripts/e2e.mts    # includes deliberate negative cases:
                                 #   forged manifest digests, duplicate approvals,
                                 #   unauthorised canary, revoked keys, rollbacks
```

The e2e suite's negative section is executable threat-model documentation — extend it rather than filing a "bug" for behaviour already covered.

## Reported to (and addressed in) this build

- Forged or backdated approvals — defence: every approval carries a `signatureDigest` bound to `(release, governance role, decision)`; server refuses mismatches and duplicate decisions (`apps/api/scripts/e2e.mts`, negative section).
- Stolen signing service key — defence: signing services hold role-specific keys that can be revoked (`POST /api/v1/keys/:id/revoke`); devices pin the registry and refuse receipts signed by revoked keys (device-sim negative test).
- Artifact substitution — defence: releases pin `artifactDigestSha256`; devices verify the artifact digest before install and the receipt verification is fail-closed.
- Reentrancy / access-control on-chain — defence: contract is OZ `AccessControl` + `ReentrancyGuard` + `Pausable` with EIP-712 decision hashes (forge test suite).
- Audit tampering — defence: audit events are hash-chained (`prevHash`/`hash` per event); the control room verifies the chain client-side and refuses gaps (`/app/audit`).

## Known residual risks

See `docs/KNOWN_LIMITATIONS.md` — in particular: demo auth is single-workspace scrypt with revokable HMAC sessions (acceptable for the demo, replace sessions with SSO + MFA before production); OTA integrations beyond the simulator are **not verified**; the blockchain mirror's ANNOUNCED-not-broadcast mode must not be presented to end-users as chain confirmation.
