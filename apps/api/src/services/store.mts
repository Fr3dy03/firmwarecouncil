import path from "node:path";
import fs from "node:fs";
import { createHash, randomUUID } from "node:crypto";

/**
 * File-backed JSON store implementing the Storage interface that mirrors the
 * Prisma schema. Used for instant local development and deterministic tests.
 * In production `DATABASE_URL` would select a Postgres adapter with the same
 * interface (see docs/ARCHITECTURE.md §6 and apps/api/prisma/schema.prisma).
 */

export interface DbShape {
  meta: { schemaVersion: number; seededAt?: string; auditSeq: number };
  organisations: Record<string, any>;
  users: Record<string, any>;
  signingKeys: Record<string, any>;
  productLines: Record<string, any>;
  releases: Record<string, any>;
  approvals: Record<string, any>;
  rolloutPolicies: Record<string, any>;
  rollouts: Record<string, any>;
  fleets: Record<string, any>;
  devices: Record<string, any>;
  receipts: Record<string, any>;
  incidents: Record<string, any>;
  incidentComments: Record<string, any>;
  otaIntegrations: Record<string, any>;
  transactions: Record<string, any>;
  auditLog: Record<string, any>;
  authNonces: Record<string, any>;
}

const SCHEMA_VERSION = 1;

function emptyDb(): DbShape {
  return {
    meta: { schemaVersion: SCHEMA_VERSION, auditSeq: 0 },
    organisations: {}, users: {}, signingKeys: {}, productLines: {}, releases: {},
    approvals: {}, rolloutPolicies: {}, rollouts: {}, fleets: {}, devices: {},
    receipts: {}, incidents: {}, incidentComments: {}, otaIntegrations: {},
    transactions: {}, auditLog: {}, authNonces: {},
  };
}

export class JsonStore {
  private data: DbShape;
  private file: string;
  private flushTimer: NodeJS.Timeout | null = null;
  private lastSaveMtimeMs = 0;
  private watcher: NodeJS.Timeout | null = null;

  constructor(file = process.env.FC_DB_FILE ?? path.resolve(process.cwd(), "data/db.json")) {
    this.file = file;
    this.data = this.load();
    this.lastSaveMtimeMs = fs.existsSync(this.file) ? fs.statSync(this.file).mtimeMs : 0;
    // Dev nicety: `npm run seed` while the dev server runs — external writes reload here.
    this.startWatcher();
  }

  private startWatcher() {
    if (process.env.FC_NO_DB_WATCH) return;
    this.watcher = setInterval(() => {
      try {
        if (!fs.existsSync(this.file)) return;
        const mtime = fs.statSync(this.file).mtimeMs;
        if (Math.abs(mtime - this.lastSaveMtimeMs) > 1) {
          this.data = this.load();
          this.lastSaveMtimeMs = fs.statSync(this.file).mtimeMs;
          console.error(`[store] external change detected — reloaded ${this.file}`);
        }
      } catch { /* file mid-write */ }
    }, 500);
    this.watcher.unref();
  }

  private load(): DbShape {
    try {
      if (fs.existsSync(this.file)) {
        return JSON.parse(fs.readFileSync(this.file, "utf8")) as DbShape;
      }
    } catch (err) {
      console.error(`[store] failed to read ${this.file}: ${err}`);
    }
    return emptyDb();
  }

  saveNow() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), "utf8");
    this.lastSaveMtimeMs = fs.statSync(this.file).mtimeMs;
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.saveNow();
  }

  private scheduleFlush() {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => this.flush(), 400);
  }

  all<K extends keyof DbShape>(coll: K): DbShape[K] {
    return this.data[coll];
  }

  list<K extends keyof DbShape>(coll: K): any[] {
    return Object.values(this.data[coll] as Record<string, any>);
  }

  find<K extends keyof DbShape>(coll: K, predicate: (x: any) => boolean): any | undefined {
    return this.list(coll).find(predicate);
  }

  filter<K extends keyof DbShape>(coll: K, predicate: (x: any) => boolean): any[] {
    return this.list(coll).filter(predicate);
  }

  get<K extends keyof DbShape>(coll: K, id: string): any | undefined {
    return (this.data[coll] as Record<string, any>)[id];
  }

  put<K extends keyof DbShape>(coll: K, entity: any): any {
    const id = entity.id ?? randomUUID();
    (this.data[coll] as Record<string, any>)[id] = { ...entity, id };
    this.scheduleFlush();
    return (this.data[coll] as Record<string, any>)[id];
  }

  update<K extends keyof DbShape>(coll: K, id: string, patch: Partial<any>): any | undefined {
    const current = (this.data[coll] as Record<string, any>)[id];
    if (!current) return undefined;
    const merged = { ...current, ...patch };
    (this.data[coll] as Record<string, any>)[id] = merged;
    this.scheduleFlush();
    return merged;
  }

  remove<K extends keyof DbShape>(coll: K, id: string): boolean {
    const bag = this.data[coll] as Record<string, any>;
    if (!(id in bag)) return false;
    delete bag[id];
    this.scheduleFlush();
    return true;
  }

  nextSequence(): number {
    this.data.meta.auditSeq += 1;
    this.scheduleFlush();
    return this.data.meta.auditSeq;
  }

  reset() {
    this.data = emptyDb();
    this.saveNow();
  }
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
}
