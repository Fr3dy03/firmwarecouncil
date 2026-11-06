import { createHash } from "node:crypto";
import { JsonStore, canonicalJson, sha256Hex } from "./store.mts";

/**
 * Manifest verification — strict schema + canonical digest computation.
 * Malformed or tampered manifests are rejected before reaching approvers.
 */

const SUPPORTED_URL_HOSTS = [
  "artifacts.firmwarecouncil.local",
  "ota.mender-demo.local",     // sim adapter
  "s3.firmwarecouncil.local",
];

export interface ManifestInput {
  version: string;
  buildIdentifier: string;
  targetRevisions: string[];
  artifactDigestSha256: string;
  artifactSizeBytes: number;
  artifactUrl: string;
  productCompatibility: string;
  securityNotes: string;
}

export class ManifestError extends Error {
  constructor(public issues: string[], public httpStatus = 400) {
    super("invalid_manifest");
  }
}

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

export function validateManifest(input: Partial<ManifestInput>): string[] {
  const issues: string[] = [];
  if (input.version == null || !SEMVER_RE.test(input.version)) {
    issues.push("version must be semver like 3.4.1 or 3.4.1-rc.2");
  }
  if (!input.buildIdentifier || typeof input.buildIdentifier !== "string") {
    issues.push("buildIdentifier is required");
  }
  if (!Array.isArray(input.targetRevisions) || input.targetRevisions.length === 0) {
    issues.push("at least one target hardware revision is required");
  }
  if (!input.artifactDigestSha256 || !/^[a-f0-9]{64}$/.test(input.artifactDigestSha256)) {
    issues.push("artifactDigestSha256 must be a 64-hex SHA-256 digest");
  }
  if (!Number.isInteger(input.artifactSizeBytes) || (input.artifactSizeBytes ?? 0) <= 0) {
    issues.push("artifactSizeBytes must be a positive integer");
  }
  if (!input.artifactUrl || typeof input.artifactUrl !== "string") {
    issues.push("artifactUrl is required");
  } else {
    try {
      const u = new URL(input.artifactUrl);
      if (SUPPORTED_URL_HOSTS.length > 0 && !SUPPORTED_URL_HOSTS.includes(u.hostname)) {
        issues.push(`artifactUrl host "${u.hostname}" is not in the allow-list of configured artifact hosts`);
      }
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        issues.push("artifactUrl must be an http(s) URL");
      }
      if (/^(localhost|127\.|169\.254\.|metadata\.)/.test(u.hostname) || u.hostname === "0.0.0.0" || u.port === "169254") {
        issues.push("artifactUrl host is forbidden (internal/metadata endpoints)");
      }
    } catch {
      issues.push("artifactUrl is not a valid URL");
    }
  }
  if (!input.productCompatibility) issues.push("productCompatibility statement is required");
  if (input.securityNotes === undefined) issues.push("securityNotes field required (may be empty string)");

  // malicious manifest scan: reject embedded scripts/commands in free text
  const text = `${input.productCompatibility ?? ""} ${input.securityNotes ?? ""}`;
  for (const bad of ["<script", "rm -rf", "$(", "#!/bin/sh", "eval(", "document.", "http://porn"]) {
    if (text.toLowerCase().includes(bad.toLowerCase())) {
      issues.push(`malicious content pattern detected: ${bad}`);
    }
  }
  return issues;
}

/** Canonical digest (sha256 over sorted-key JSON) for tamper evidence. */
export function manifestDigest(input: ManifestInput): string {
  return sha256Hex(canonicalJson(input));
}

export function isDuplicateArtifact(store: JsonStore, digest: string, releaseId?: string): boolean {
  return store
    .list("releases")
    .some((r) => r.manifest?.artifactDigestSha256 === digest && r.id !== releaseId);
}

export function chainOfDigests(store: JsonStore, release: any): string[] {
  const chain: string[] = [];
  let cursor = release;
  while (cursor) {
    chain.push(cursor.manifest?.artifactDigestSha256 ?? "?");
    cursor = cursor.manifest?.previousReleaseId
      ? store.get("releases", cursor.manifest.previousReleaseId)
      : undefined;
  }
  return chain;
}

export function recomputeDigestOverManifest(manifest: ManifestInput): string {
  return createHash("sha256").update(canonicalJson(manifest), "utf8").digest("hex");
}
