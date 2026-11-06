/** Route di guard — attaches session user from Bearer token into request.user. */
export type { FastifyPluginAsync } from "fastify";

import type { FastifyInstance } from "fastify";
import { AuthService, AuthError } from "../services/auth.mts";
import { GovernanceError } from "../services/releases.mts";
import { KeyError } from "../services/keys.mts";
import { ManifestError } from "../services/manifest.mts";
import type { SessionUser } from "@fc/shared";

export interface RequestCtx {
  user: SessionUser | null;
}

declare module "fastify" {
  interface FastifyRequest {
    fcUser?: SessionUser | null;
  }
}

export function extractToken(request: any): string | null {
  const auth = (request.headers.authorization ?? "") as string;
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  return token || null;
}

export function attachUser(instance: FastifyInstance, auth: AuthService) {
  instance.addHook("preHandler", async (request: any) => {
    const token = extractToken(request);
    const user = token ? auth.verifyToken(token) : null;
    // Canonical id alias: services and downstream code read `user.id` while
    // SessionUser exposes `userId` — never let that silently become undefined.
    request.fcUser = user ? { ...user, id: user.userId } : null;
  });
}

export function requireUser(request: any): SessionUser {
  const user = request.fcUser;
  if (!user) throw new AuthError("not_authenticated", 401);
  return user;
}

export function registerErrorHandler(instance: FastifyInstance) {
  instance.setErrorHandler((err: any, request: any, reply: any) => {
    if (err instanceof AuthError || err instanceof GovernanceError || err instanceof KeyError) {
      const status = (err as any).httpStatus ?? 500;
      const code = err.code || err.message || "error";
      reply.status(status).send({ error: { code, message: err.message, detail: (err as any).detail } });
      return;
    }
    if (err instanceof ManifestError) {
      reply.status(err.httpStatus).send({ error: { code: "invalid_manifest", message: "manifest rejected", detail: err.issues } });
      return;
    }
    if (err && err.statusCode && err.statusCode < 500) {
      reply.status(err.statusCode).send({ error: { code: err.name ?? "bad_request", message: err.message } });
      return;
    }
    request.log.error(err);
    reply.status(500).send({ error: { code: "internal_error", message: "unexpected server error" } });
  });
}
