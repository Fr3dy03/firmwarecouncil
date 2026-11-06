import { JsonStore, sha256Hex } from "./store.mts";
import type { AuditEvent } from "@fc/shared";

/**
 * Append-only audit trail with hash chaining (tamper evidence).
 * Every governance-relevant action must pass through here.
 */
export class AuditService {
  constructor(private store: JsonStore) {}

  append(input: {
    kind: string;
    entity: string;
    detail: string;
    actorUserId?: string;
    actorOrganisationId?: string;
    timestamp?: string;
  }): AuditEvent {
    const seq = this.store.nextSequence();
    const prev = [...this.store.list("auditLog")]
      .sort((a, b) => b.sequence - a.sequence)[0];
    const ts = input.timestamp ?? new Date().toISOString();
    const pending: Partial<AuditEvent> = {
      id: `aud_${seq}`,
      sequence: seq,
      timestamp: ts,
      kind: input.kind,
      entity: input.entity,
      detail: input.detail,
      actorUserId: input.actorUserId,
      actorOrganisationId: input.actorOrganisationId,
      prevHash: prev?.hash,
    };
    const payload = `${seq}|${ts}|${input.kind}|${input.entity}|${input.detail}|${prev?.hash ?? "GENESIS"}`;
    const ev = pending as AuditEvent;
    ev.hash = sha256Hex(payload);
    this.store.put("auditLog", ev);
    return ev;
  }
}
