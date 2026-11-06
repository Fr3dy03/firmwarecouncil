# Security testing runbook

How to run the security-relevant test assets of this build and what each one proves.

## 1. Contract-level (Solidity)

```bash
cd contracts
forge test -vvv
```

22 tests cover: role-gated actions for MANUFACTURER / SECURITY_REVIEWER / OPERATOR / EMERGENCY_ADMIN, EIP-712 approval verification (wrong signer, expired deadline, wrong nonce must all revert), canary result recording rules, staged rollout advancement rules, pause/resume, revocation, supersede, and receipt batch commits. All must pass before deployment.

## 2. Governance workflow e2e (backend state machine)

```bash
node apps/api/scripts/e2e.mts     # reseeds itself; expect exit 0
npm run test:api                  # suite wrapper (apps/api/scripts/test-all.mts)
```

The harness runs the honest happy path (propose → sign → security approve → operator approve → canary → staged rollout → DEPLOYED → release-train verification → audit chain intact) **and then deliberately attacks the system**. Each negative case must produce an error, not a state change:

| Attack | Expected defence |
| --- | --- |
| Tampered manifest digest | manifest digest mismatch refused |
| Duplicate artifact digest | duplicate release-of-artifact refused |
| Artifact URL inside internal namespace | internal URL policy refusal |
| Duplicate security approval (same role again) | refused as duplicate decision |
| Premature operator approval (before security) | refused: decision not available in state |
| Security reviewer tries to act as operator | refused: wrong governance phase/role |
| Unauthorised canary open | refused: operator-only action |
| Canary failure without incident handling | auto-incident created; rollout paused; rollback authorised |
| Receipt from a revoked signing key | receipt refused (fail-closed) |
| Offline devices during rollout | counters honesty: contacted/offline separated, no fake success |

## 3. Device agent unit tests

```bash
npm run test:sim
```

Covers pinned-key Ed25519 receipt verification: correct key accepted; attacker key rejected; garbage signature/key material fails **without throwing** (fail-closed); signature over a tampered message rejected. A recent regression (open failure on malformed pinned keys) was caught and fixed by this suite — keep it in CI.

## 4. Live network probe (deployment safety)

```bash
npm run check -w @fc/deploy
```

Verifies chain identities match expectations (968 / 677), reports head blocks, measures mainnet `eth_getLogs` behaviour (bounded-range answer speed, full-range reliability) and warns if the deployer key is unfunded — before anything can be broadcast.

## 5. Controls NOT covered by automation (manual checklist)

- [ ] `.env` secrets are not committed and differ per environment (`AUTH_SECRET`, `GOV_PRIVATE_KEY`).
- [ ] Key rotation ceremony rehearsed: `POST /keys/:id/rotate` then device fleet converges on the new registry (simulator restart).
- [ ] Session revocation works under reuse: replay a logged-out token (server refuses).
- [ ] The ANNOUNCED-not-broadcast mirror is never rendered as chain confirmation in any UI copy.
- [ ] Faucet-funded deployer key is treated as a burner: separate from any personal wallet, rotated after demo phases.
