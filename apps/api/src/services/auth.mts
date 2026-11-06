import { scryptSync, randomBytes, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { JsonStore } from "./store.mts";
import type { SessionUser } from "@fc/shared";

/**
 * Authentication service:
 *  - scrypt password hashing with per-user salt
 *  - HMAC-signed opaque session tokens with server-side revocation
 * Private key/signing material is never accepted or stored by this service.
 */

export class AuthService {
  private store: JsonStore;
  private secret: Buffer;

  constructor(store: JsonStore, secret: string) {
    this.store = store;
    this.secret = Buffer.from(secret, "utf8");
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString("hex");
  }

  createUser(input: {
    email: string; name: string; password: string;
    organisationId: string; role: string;
  }) {
    if (this.store.find("users", (u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new AuthError("email_already_registered", 409);
    }
    const salt = randomBytes(16).toString("hex");
    const user = this.store.put("users", {
      email: input.email.toLowerCase(),
      name: input.name,
      organisationId: input.organisationId,
      role: input.role,
      createdAt: new Date().toISOString(),
      passwordSalt: salt,
      passwordHash: this.hashPassword(input.password, salt),
    });
    return { ...user, passwordHash: undefined, passwordSalt: undefined };
  }

  login(email: string, password: string): { token: string; user: SessionUser } {
    const user = this.store.find("users", (u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new AuthError("invalid_credentials", 401);
    const candidate = this.hashPassword(password, user.passwordSalt);
    const provided = Buffer.from(candidate, "hex");
    const stored = Buffer.from(user.passwordHash, "hex");
    if (!timingSafeEqual(provided, stored)) throw new AuthError("invalid_credentials", 401);

    const org = this.store.get("organisations", user.organisationId);
    const token = this.issueToken(user.id);
    return { token, user: this.sessionFor(user, org) };
  }

  issueToken(userId: string): string {
    const expires = Date.now() + 24 * 3600_000;
    const nonce = createHash("sha256").update(randomBytes(24)).digest("hex");
    const payload = Buffer.from(JSON.stringify({ userId, expires, nonce })).toString("base64url");
    const mac = createHmac("sha256", this.secret).update(payload).digest("base64url");
    const token = `${payload}.${mac}`;
    this.store.put("authNonces", { id: nonce, userId, expires, revoked: false });
    return token;
  }

  verifyToken(token: string): SessionUser {
    const [payload, mac] = token.split(".");
    if (!payload || !mac) throw new AuthError("invalid_session", 401);
    const expected = createHmac("sha256", this.secret).update(payload).digest("base64url");
    if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
      throw new AuthError("invalid_session", 401);
    }
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (Date.now() > parsed.expires) throw new AuthError("session_expired", 401);
    const nonceRow = this.store.get("authNonces", parsed.nonce);
    if (!nonceRow || nonceRow.revoked) throw new AuthError("session_revoked", 401);
    const user = this.store.get("users", parsed.userId);
    if (!user) throw new AuthError("invalid_session", 401);
    const org = this.store.get("organisations", user.organisationId);
    return this.sessionFor(user, org);
  }

  logout(token: string) {
    try {
      const [payload, mac] = token.split(".");
      const expected = createHmac("sha256", this.secret).update(payload).digest("base64url");
      if (!timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return;
      const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (this.store.get("authNonces", parsed.nonce)) {
        this.store.update("authNonces", parsed.nonce, { revoked: true });
      }
    } catch { /* ignore malformed logout */ }
  }

  sessionFor(user: any, org: any): SessionUser {
    return {
      userId: user.id,
      organisationId: user.organisationId,
      role: user.role,
      email: user.email,
      name: user.name,
      orgName: org?.name ?? user.organisationId,
      orgType: org?.type ?? "PLATFORM",
    };
  }
}

export class AuthError extends Error {
  constructor(public code: string, public httpStatus: number) {
    super(code);
  }
}
