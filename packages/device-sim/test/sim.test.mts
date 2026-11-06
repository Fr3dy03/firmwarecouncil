/**
 * Standalone device-sim unit tests (no API server required).
 * Covers the security-critical primitives of the device reference agent:
 *   - pinned-key Ed25519 receipt signature verification (rejects foreign keys)
 *   - ApiError envelope semantics
 *
 * Run: npm run test:sim   (root)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { verifyWithPinnedKey, ApiError } = await import("../src/agent.mts");
const { ed25519 } = await import("@noble/curves/ed25519.js");

const msg = Buffer.from(
  JSON.stringify({ releaseId: "rel_x", deviceId: "pump-01", outcome: "SUCCESS", version: "2.4.0" }),
);

function freshKeyPair() {
  const secretKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(secretKey);
  return { secretKey, publicKey };
}

test("verifyWithPinnedKey accepts a signature from the pinned device key", () => {
  const { secretKey, publicKey } = freshKeyPair();
  const sig = ed25519.sign(msg, secretKey);
  assert.equal(verifyWithPinnedKey(msg, Buffer.from(sig).toString("base64"), Buffer.from(publicKey)), true);
});

test("verifyWithPinnedKey rejects a signature from a different key (impersonation)", () => {
  const attacker = freshKeyPair();
  const pinned = freshKeyPair();
  const sig = ed25519.sign(msg, attacker.secretKey);
  assert.equal(verifyWithPinnedKey(msg, Buffer.from(sig).toString("base64"), Buffer.from(pinned.publicKey)), false);
});

test("verifyWithPinnedKey rejects forged/garbage signatures without throwing", () => {
  const randomPub = Buffer.from(ed25519.utils.randomPrivateKey());
  assert.equal(verifyWithPinnedKey(msg, "not-a-signature!!", randomPub), false);
  assert.equal(verifyWithPinnedKey(msg, Buffer.alloc(0).toString("base64"), randomPub), false);
  assert.equal(verifyWithPinnedKey(msg, Buffer.alloc(32, 0).toString("base64"), randomPub), false);
  // Empty pinned key must fail safely as well (never crash the device agent).
  assert.equal(verifyWithPinnedKey(msg, Buffer.alloc(0).toString("base64"), Buffer.alloc(0)), false);
});

test("verifyWithPinnedKey rejects signatures made over the wrong message", () => {
  const { secretKey, publicKey } = freshKeyPair();
  const tamperedMsg = Buffer.concat([msg, Buffer.from(" tampered")]);
  const sig = ed25519.sign(tamperedMsg, secretKey);
  assert.equal(verifyWithPinnedKey(msg, Buffer.from(sig).toString("base64"), Buffer.from(publicKey)), false);
});

test("ApiError identifies the failing code and HTTP status", () => {
  const err = new ApiError(403, "FORBIDDEN_ROLE", "decisions require SECURITY_REVIEWER role");
  assert.equal(err.httpStatus, 403);
  assert.equal(err.code, "FORBIDDEN_ROLE");
  assert.match(err.message, /FORBIDDEN_ROLE/);
  assert.ok(err instanceof Error);
});
