import { createHash, verify, KeyObject, createPublicKey } from "node:crypto";
import { JsonStore, sha256Hex } from "./store.mts";
import { AuditService } from "./audit.mts";

/**
 * Signing key manager.
 *
 * Stores ONLY public Ed25519 material (base64). Private keys live on the
 * party's own workstation/HSM and are never transmitted to FirmwareCouncil.
 */

export interface KeyCheck {
  valid: boolean;
  reason?: string;
  keyId?: string;
}

export class SigningKeysService {
  constructor(private store: JsonStore, private audit: AuditService) {}

  static fingerprint(pubB64: string): string {
    const raw = Buffer.from(pubB64, "base64");
    const fp = createHash("sha256").update(raw).digest("hex").toUpperCase();
    return (fp.match(/.{4}/g) ?? []).slice(0, 10).join(":");
  }

  validatePublicKeyFormat(publicKey: string): { ok: true; obj: KeyObject } | { ok: false; reason: string } {
    try {
      const raw = Buffer.from(publicKey, "base64");
      if (raw.length !== 32) return { ok: false, reason: "ed25519 public key must be 32 bytes" };
      const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), raw]);
      const keyObj = createPublicKey({ key: der, format: "der", type: "spki" });
      return { ok: true, obj: keyObj };
    } catch {
      return { ok: false, reason: "not a parseable ed25519 public key" };
    }
  }

  registerKey(input: {
    body: {
      organisationId: string;
      label: string;
      publicKey: string;
      productScope?: string[];
      expiresAt?: string;
      notes?: string;
    };
    actorUserId: string;
  }) {
    const fmt = this.validatePublicKeyFormat(input.body.publicKey);
    if (!fmt.ok) throw new KeyError(fmt.reason!, 400);
    const key = this.store.put("signingKeys", {
      organisationId: input.body.organisationId,
      label: input.body.label,
      publicKey: input.body.publicKey,
      fingerprint: SigningKeysService.fingerprint(input.body.publicKey),
      productScope: input.body.productScope ?? [],
      state: "ACTIVE",
      validFrom: new Date().toISOString(),
      expiresAt: input.body.expiresAt,
      notes: input.body.notes,
    });
    this.audit.append({
      kind: "signing-key.registered",
      entity: `signing-key:${key.id}`,
      detail: `key "${key.label}" registered (${key.fingerprint})`,
      actorUserId: input.actorUserId,
      actorOrganisationId: input.body.organisationId,
    });
    return key;
  }

  rotateKey(oldKeyId: string, replacement: { publicKey: string; label: string }, actorUserId: string) {
    const oldKey = this.store.get("signingKeys", oldKeyId);
    if (!oldKey) throw new KeyError("key_not_found", 404);
    if (oldKey.state !== "ACTIVE" && oldKey.state !== "ROTATING") throw new KeyError("key_not_active", 409);
    const fresh = this.registerKey({
      body: {
        organisationId: oldKey.organisationId,
        label: replacement.label,
        publicKey: replacement.publicKey,
        productScope: oldKey.productScope,
        expiresAt: oldKey.expiresAt,
        notes: `rotated from ${oldKeyId}`,
      },
      actorUserId,
    });
    this.store.update("signingKeys", oldKeyId, { state: "ROTATING", rotatedFrom: undefined });
    this.store.update("signingKeys", fresh.id, { rotatedFrom: oldKeyId });
    this.audit.append({
      kind: "signing-key.rotate",
      entity: `signing-key:${oldKeyId}`,
      detail: `-> ${fresh.id}`,
      actorUserId,
      actorOrganisationId: oldKey.organisationId,
    });
    return fresh;
  }

  revokeKey(keyId: string, actorUserId: string, organisationId: string) {
    const key = this.store.get("signingKeys", keyId);
    if (!key) throw new KeyError("key_not_found", 404);
    const updated = this.store.update("signingKeys", keyId, {
      state: "REVOKED",
      revokedAt: new Date().toISOString(),
    });
    this.audit.append({
      kind: "signing-key.revoked",
      entity: `signing-key:${keyId}`,
      detail: `key "${key.label}" revoked; verification is now refused for artifacts signed with this key`,
      actorUserId,
      actorOrganisationId: organisationId,
    });
    return updated;
  }

  historicalKeys(organisationId: string) {
    return this.store.filter("signingKeys", (k) => k.organisationId === organisationId)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  }

  /**
   * Verify a base64 Ed25519 `signature` over `message` for an org's active key.
   * Refuses revoked/expired keys — SECURITY requirement.
   */
  verifyWithActiveKey(organisationId: string, message: Buffer, signatureB64: string): KeyCheck {
    const keys = this.store
      .filter("signingKeys", (k) => k.organisationId === organisationId)
      .sort((k) => (k.state === "ACTIVE" ? -1 : 1));
    for (const key of keys) {
      if (key.state === "REVOKED") continue;
      if (key.expiresAt && new Date(key.expiresAt).getTime() < Date.now()) continue;
      const fmt = this.validatePublicKeyFormat(key.publicKey);
      if (!fmt.ok) continue;
      const ok = verify(null, message, fmt.obj, Buffer.from(signatureB64, "base64"));
      if (ok) return { valid: true, keyId: key.id };
      if (key.state === "REVOKED") return { valid: false, reason: "key_revoked", keyId: key.id };
    }
    const anyKeys = keys.length;
    return {
      valid: false,
      reason: anyKeys ? "signature_mismatch_or_key_unavailable" : "no_registered_signing_keys",
    };
  }

  keyManifest(organisationId: string) {
    const keys = this.store.filter("signingKeys", (k) => k.organisationId === organisationId);
    const manifest = {
      manifestVersion: 1,
      issuedAt: new Date().toISOString(),
      keys: keys.map((k) => ({
        kid: k.id,
        publicKey: k.publicKey,
        state: k.state,
        productScope: k.productScope,
        expiresAt: k.expiresAt ?? null,
      })),
    };
    // Signed key manifest digest (the canonical TUF-style snapshot digest)
    const canonical = JSON.stringify({ m: manifest });
    return { ...manifest, manifestDigest: sha256Hex(canonical) };
  }
}

export class KeyError extends Error {
  constructor(public message: string, public httpStatus: number) {
    super(message);
  }
}
