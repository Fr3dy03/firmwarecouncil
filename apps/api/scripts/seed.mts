import process from "node:process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateKeyPairSync, createHash } from "node:crypto";
import { JsonStore } from "../src/services/store.mts";
import { AuditService } from "../src/services/audit.mts";
import { AuthService } from "../src/services/auth.mts";
import { SigningKeysService } from "../src/services/keys.mts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.resolve(__dirname, "../data/db.json");
const KEYS_DIR = path.resolve(__dirname, "../../../packages/device-sim/keys");

const store = new JsonStore(DB_FILE);
store.reset();
const audit = new AuditService(store);
const auth = new AuthService(store, process.env.FC_SESSION_SECRET ?? "firmwarecouncil-demo-secret-change-me");
const keys = new SigningKeysService(store, audit);

function pubB64(pem: string) { return Buffer.from(pemToRaw(pem)).toString("base64"); }
function pemToRaw(pem: string): Buffer {
  const b64 = pem.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "").replace(/\s+/g, "");
  return Buffer.from(b64, "base64").subarray(12); // strip 12-byte SPKI header for ed25519
}

// ------------------------------------------------------------------- orgs

const now = new Date().toISOString();
const ardane = store.put("organisations", { name: "Ardane Systems", type: "MANUFACTURER", vendorAddress: null, createdAt: now });
const volt = store.put("organisations", { name: "Volt Ridge Fleet Ops", type: "OPERATOR", vendorAddress: null, createdAt: now });
const sentinel = store.put("organisations", { name: "Sentinel Review Group", type: "SECURITY", vendorAddress: null, createdAt: now });
const platform = store.put("organisations", { name: "FirmwareCouncil Platform", type: "PLATFORM", vendorAddress: null, createdAt: now });

// ------------------------------------------------------------- demo users

const users = [
  { email: "dev@ardane.example", name: "Jae-un Park (Ardane Systems)", org: ardane.id, role: "MANUFACTURER", password: "maker-demo-pass" },
  { email: "review@sentinel.example", name: "Ana Duarte (Sentinel Review)", org: sentinel.id, role: "SECURITY_REVIEWER", password: "security-demo-pass" },
  { email: "ops@voltridge.example", name: "Marcus Toft (Volt Ridge Ops)", org: volt.id, role: "OPERATOR", password: "operator-demo-pass" },
  { email: "admin@firmwarecouncil.example", name: "FRC Platform Admin", org: platform.id, role: "PLATFORM_ADMIN", password: "platform-demo-pass" },
  { email: "second-review@sentinel.example", name: "Ruslan Sato (Sentinel Review)", org: sentinel.id, role: "SECURITY_REVIEWER", password: "security-demo-pass" },
];
for (const u of users) {
  auth.createUser({ email: u.email, name: u.name, password: u.password, organisationId: u.org, role: u.role });
}

// -------------------------------------------------- manufacturer signing key

fs.mkdirSync(KEYS_DIR, { recursive: true });
const manufacturerPair = generateKeyPairSync("ed25519");
const manufacturerPrivateKeyPem = manufacturerPair.privateKey.export({ type: "pkcs8", format: "pem" }) as string;
fs.writeFileSync(path.join(KEYS_DIR, "manufacturer.key"), manufacturerPrivateKeyPem, { mode: 0o600 });
const manufacturerPublicPem = (manufacturerPair.publicKey.export({ type: "spki", format: "pem" }) as string);
const manufacturerPubRaw = pemToRaw(manufacturerPublicPem);
fs.writeFileSync(path.join(KEYS_DIR, "manufacturer.pub"), manufacturerPubRaw, { mode: 0o600 });
const mKey = keys.registerKey({
  body: {
    organisationId: ardane.id,
    label: "Ardane ST-7 release signing (HSM-backed)",
    publicKey: manufacturerPubRaw.toString("base64"),
    expiresAt: new Date(Date.now() + 90 * 24 * 3600_000).toISOString(),
  },
  actorUserId: "seed",
});

// device signing key (sim)
const devicePair = generateKeyPairSync("ed25519");
fs.writeFileSync(path.join(KEYS_DIR, "device.key"), devicePair.privateKey.export({ type: "pkcs8", format: "pem" }) as string, { mode: 0o600 });
const devicePubRaw = pemToRaw(devicePair.publicKey.export({ type: "spki", format: "pem" }) as string);
fs.writeFileSync(path.join(KEYS_DIR, "device.pub"), devicePubRaw, { mode: 0o600 });
const dKey = keys.registerKey({
  body: { organisationId: volt.id, label: "Volt Ridge device cohort keys (sim)", publicKey: devicePubRaw.toString("base64") },
  actorUserId: "seed",
});

// ------------------------------------------------------------ product lines

const pl = store.put("productLines", {
  organisationId: ardane.id,
  name: "Ardane ST-7 (TX module)",
  productName: "ST-7 telemetry transmitter",
  hardwareRevisions: [
    { id: "hwrev_st7_b3", productLineId: "", revision: "B3", architecture: "armv7-m", bootloaderRequirement: "ST bootloader >=1.2 with RAM signature verify", createdAt: now },
    { id: "hwrev_st7_b4", productLineId: "", revision: "B4", architecture: "armv7-m", bootloaderRequirement: "same as B3", createdAt: now },
  ],
  defaultArchitecture: "armv7-m",
  bootloaderRequirements: "ST bootloader >=1.2",
  otaProviderId: "",
  compatibilityPolicy: "strict",
  supportedFirmwareVersions: ["3.x"],
  createdAt: now,
  active: true,
});

// ------------------------------------------------------------------- fleets

const fleet = store.put("fleets", {
  organisationId: volt.id,
  name: "ST-7 B3 North Sea Buoys",
  productLineId: pl.id,
  createdAt: now,
});
const devices = [];
for (let i = 1; i <= 12; i++) {
  devices.push(store.put("devices", {
    fleetId: fleet.id,
    deviceRef: `BUOY-ST7-${String(i).padStart(3, "0")}`,
    hardwareRevisionId: "hwrev_st7_b3",
    productLineId: pl.id,
    organisationId: volt.id,
    deviceSigningKeyId: dKey.id,
    status: i <= 10 ? "ONLINE" : "OFFLINE",
    lastSeenAt: now,
  }));
}

// ------------------------------------------------------------ OTA providers

store.put("otaIntegrations", {
  organisationId: volt.id,
  kind: "simulator",
  label: "FirmwareCouncil simulator (reference)",
  baseUrl: "local://simulator",
  credentialRef: "n/a (local model)",
  verified: true,
  createdAt: now,
});
store.put("otaIntegrations", {
  organisationId: volt.id,
  kind: "mender",
  label: "Mender (hosted) — shipment pending sandbox verify",
  baseUrl: "https://hosted.mender.io/api/management/v1/deployments",
  credentialRef: "env.MENDER_PAT",
  verified: false,
  createdAt: now,
});
store.put("otaIntegrations", {
  organisationId: volt.id,
  kind: "hawkbit",
  label: "Eclipse hawkBit — shape only (unverified)",
  baseUrl: "https://hawkbit.example.local/rest/v1",
  credentialRef: "env.HAWKBIT_TOKEN",
  verified: false,
  createdAt: now,
});
store.put("otaIntegrations", {
  organisationId: volt.id,
  kind: "balena",
  label: "balenaCloud — shape only (unverified)",
  baseUrl: "https://api.balena-cloud.com",
  credentialRef: "env.BALENA_TOKEN",
  verified: false,
  createdAt: now,
});

// ------------------------------------------------- pre-seeded stable release

const releaseA = store.put("releases", {
  organisationId: ardane.id,
  productLineId: pl.id,
  status: "DEPLOYED",
  manifest: {
    releaseId: "",
    version: "3.3.0",
    buildIdentifier: "ST7-3.3.0-2026-10-28-b4f2",
    targetRevisions: ["B3", "B4"],
    artifactDigestSha256: createHash("sha256").update("ST7-3.3.0-firmware.bin").digest("hex"),
    artifactSizeBytes: 337_256,
    artifactUrl: "https://s3.firmwarecouncil.local/st7/3.3.0/fw.bin",
    productCompatibility: "B3/B4 bootloaders >=1.2",
    securityNotes: "No new capabilities; hardening of crypto self-test.",
    manifestDigest: "seeded",
  },
  approvals: [],
  createdBy: users[0].email,
  createdAt: new Date("2026-10-28T09:00:00Z").toISOString(),
  deviceSigningKeyIdSeed: "",
});
store.update("releases", releaseA.id, { manifest: { ...releaseA.manifest, releaseId: releaseA.id, manifestDigest: createHash("sha256").update(JSON.stringify(releaseA.manifest)).digest("hex") } });
store.update("devices", devices[0].id, { activeVersion: "3.3.0", lastVerifiedVersion: "3.3.0" });
store.update("devices", devices[1].id, { activeVersion: "3.3.0", lastVerifiedVersion: "3.3.0" });

store.flush();

console.log(`
Seed complete.
  DB file:   ${DB_FILE}
  Org:       Ardane Systems (MANUFACTURER)   -> dev@ardane.example / maker-demo-pass
             Sentinel Review (SECURITY)      -> review@sentinel.example / security-demo-pass
             Volt Ridge Ops (OPERATOR)       -> ops@voltridge.example / operator-demo-pass
             FirmwareCouncil (PLATFORM)      -> admin@firmwarecouncil.example / platform-demo-pass
  Keys:      packages/device-sim/keys/{manufacturer,device}.{key,pub}
  Product line ARDANE ST-7 with 12 devices.
`);
console.log(`SigningKey fingerprint: ${SigningKeysService.fingerprint(manufacturerPubRaw.toString("base64"))}`);
