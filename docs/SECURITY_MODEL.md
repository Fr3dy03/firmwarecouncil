# FirmwareCouncil — Security Model

## 1. Security posture

FirmwareCouncil is a **governance layer**, not an OTA delivery channel. It never
touches firmware payloads, and its device-side counterpart (the reference agent,
`packages/device-sim`) explicitly sits **on top of**, never **instead of**, an
Uptane/TUF-compliant updater. We do not weaken existing OTA signature
verification: OTA adapters push *authorisation context* (version, digest, scope)
into the existing deployment flow.

## 2. Assets and threat actors

| Asset | Location | Compromise effect |
| --- | --- | --- |
| Private signing keys (manufacturer) | Customer-managed (HSM) | Forged releases — mitigated by multi-party approval; a stolen manufacturer key alone cannot authorise rollout |
| Private signing keys (platform) | On server via env/vault, only for demo seed | Never used to sign manufacturer manifests |
| Firmware binary | External OTA repo / S3 | Never stored in FirmwareCouncil; only SHA-256 digests |
| Session credentials | HttpOnly signed cookie / bearer | Mitigated with scrypt password hashing + server-side revocation list |
| Audit log | Append-only store | Tamper-evident via hash chaining (`prev_hash` field) |

## 3. Controls

### 3.1 Multi-party approval (no single untrusted actor can authorise a release)

On-chain (`ReleaseGovernance.sol`) and off-chain rules are identical:

- **MANUFACTURER** registers product lines and proposes releases.
- **SECURITY_REVIEWER** must approve before rollout can be authorised.
- **OPERATOR** must separately approve to authorise rollout stages.
- Distinct roles in a single organisation are explicitly **not counted** —
  approvals must come from different organisations (manufacturer ≠ operator)
  when the review policy requires it (`crossOrg: true` default).
- Emergency pause is restricted to `EMERGENCY_ADMIN_ROLE`, revocation to
  `OPERATOR_ROLE` + emergency role, admin to `DEFAULT_ADMIN_ROLE`.

### 3.2 Signature verification chain

1. `RELEASE_SIGN` request is exactly one of: `EIP-712` typed structured signing
   (chain-bound: `chainId=968`, contract address, version) or
   `Ed25519` over the canonical digest of the manifest JSON.
2. The server recomputes `SHA-256(manifestCanonical)`, verifies key status
   (`active` → `revoked` blocks verification), checks the key's product-line
   scope, and records `signatureDigest` plus verifier metadata with the decision.
3. Devices verify against the signed key manifest (`GET /api/v1/keys/manifest`)
   and must reject the release when the key is revoked.

### 3.3 Replay protection

- EIP-712 `nonce` + `releaseId` binding; server tracks consumed `nonces`
  per signer (`SignatureRecord`).
- Backend rejects a second decision from the same approver on the same release
  in the same role (409).
- Devices track `lastVerifiedVersion` and refuse downgrades below it (Uptane
  rollback defense).

### 3.4 Manifest security

- Manifest schema is strict (`apps/api/src/modules/manifest/schema.mts`):
  additional fields rejected, numeric version ranges validated, supported
  URLs limited to configured hosts (deny-list of localhost/metadata).
- Malformed, tampered, or malicious manifests are rejected **before** reaching
  the approvers; the incident is written to the audit log.
- Digest registration is explicit in the release wizard (Step 5) — the backend
  recomputes and refuses an already-registered digest for a different release
  on the same product line (duplicate-artifact guard).

### 3.5 Emergency and rollback

- `pauseRollout` + `revokeRelease` propagate to OTA adapters within a
  bounded window; the device agent checks `revoked` before install and refuses
  unauthorised/revoked releases (sim asserts this).
- Rollback authorisation is recorded as a first-class decision
  (`authoriseRollback`), carrying the target version and approval references.

### 3.6 Chain-event safety

- `ReleaseGovernance.sol` has **no arbitrary external contract execution**;
  `nonReentrant` on receipt paths; version uniqueness via hash-set; explicit
  supersession transitions only.
- `eth_getLogs` dependency avoided for all critical reads (see FRC-D01 in
  ARCHITECTURE.md).

### 3.7 Broadcast key isolation (relay-signer model)

- The mirror separates **broadcast capability** from **decision authority**.
  The broadcaster key (`GOV_PRIVATE_KEY`) is a funded backend key holding the
  operational roles; the operator/security signers registered on-chain via
  `registerSigner` are unfunded signing identities whose EIP-712 approval
  signatures are relayed by the broadcaster.
- In production the operator/security keys stay with the human approvers
  (HSM/wallet); only the signatures transit the API. The server-side demo keys
  in `.env` are burner testnet keys and must be rotated after the demo.
- Signatures are produced by hashing with `hashTypedData`, self-verifying
  recovery, then signing the raw digest — see KNOWN_LIMITATIONS.md §9 for why
  `account.signTypedData` is not used directly.

### 3.8 Chain-anchor stability across reseeds

- `versionHash` anchors are salted with the application release UUID:
  `keccak256(productLineId:version:releaseId)` — the on-chain anchor is stable
  and unique even after a dev-store reseed regenerates app row IDs, and
  `ReleaseVersionCollision` cannot be triggered by demo-data reloads. The
  mapping from a reseeded release to its previously anchored on-chain record
  is resolved lazily from the stored `chainReleaseId` on the
  `RELEASE_PROPOSED` transaction receipt (never eth_getLogs — FRC-D01).

## 4. TUF/Uptane security property checklist

| Property | How FirmwareCouncil meets it |
| --- | --- |
| Replay / freeze defense | EIP-712 nonces; snapshot timestamp + freshness window in device manifest fetch |
| Rollback defense | Device pins `lastVerifiedVersion`; backend refuses digest reuse |
| Key compromise resilience | Multi-party quorum; separately rotatable signing keys with `rotateKey` |
| Key revocation | First-class `revoked` state in `SigningKey` + on-chain `revokeSigner` |
| Weak upgrade authorization | Only approved releases can appear in OTA adapter plan; adapters cannot create deployments for `PROPOSED/CHANGES_REQUESTED` |
| Consistency | Append-only audit with hash chaining |

## 5. Testing matrix (executed)

Every row in `apps/api/scripts/test-all.mts` and
`packages/device-sim/test/sim.test.mts` covers the required cases: invalid
manifest, wrong signing key, revoked key, replay, invalid version, unapproved
rollout attempt, canary failure halting, concurrent approval rejection,
offline device, malicious manifest, rollback failure. See `SECURITY_TESTS.md`
(runbook) and the test files themselves for exact assertions.
