"use client";

/**
 * New product line — manufacturer-only creation form.
 * Endpoint: POST /api/v1/product-lines → createProductLine(user, body):
 * body = { name, productName, defaultArchitecture, bootloaderRequirements,
 *          otaProviderId, compatibilityPolicy, supportedFirmwareVersions: string[],
 *          hardwareRevisions: [{revision, architecture, bootloaderRequirement}] }.
 * organisationId is taken from the session server-side (never sent).
 * GET /api/v1/organisations is listed for context on the owner panel.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, useSession } from "../../../../lib/api";
import { Button, EmptyState, Field, Panel, PanelTitle, inputStyle } from "../../../../components/fc/ui";
import type { Organisation } from "../../../../../../packages/shared/src/types";

interface HwRevRow {
  revision: string;
  architecture: string;
  bootloaderRequirement: string;
}

const OTA_PROVIDERS = ["simulator", "mender", "hawkbit", "balena"] as const;

export default function NewProductLinePage() {
  const { loading, user } = useSession();
  const router = useRouter();
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [name, setName] = useState("");
  const [productName, setProductName] = useState("");
  const [defaultArchitecture, setDefaultArchitecture] = useState("armv7-m");
  const [bootloaderRequirements, setBootloaderRequirements] = useState("");
  const [otaProviderId, setOtaProviderId] = useState<string>("simulator");
  const [compatibilityPolicy, setCompatibilityPolicy] = useState("strict");
  const [supportedFirmwareVersions, setSupportedFirmwareVersions] = useState("");
  const [revisions, setRevisions] = useState<HwRevRow[]>([{ revision: "", architecture: "armv7-m", bootloaderRequirement: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<Organisation[]>("/api/v1/organisations")
      .then((v) => { if (alive) setOrgs(v); })
      .catch((e: unknown) => { if (alive) setError(e instanceof ApiError ? e.message : String(e)); });
    return () => { alive = false; };
  }, []);

  if (!loading && user && user.role !== "MANUFACTURER" && user.role !== "PLATFORM_ADMIN") {
    return (
      <EmptyState
        title="Manufacturer role required"
        body={`Product line registration is a MANUFACTURER capability (this session is ${user.role}). ` +
          "Ask the manufacturer organisation's release owner to register the line, then revisit releases from here."}
        action={<Button variant="ghost" href="/app/product-lines">Back to product lines</Button>}
      />
    );
  }

  function setRev(i: number, patch: Partial<HwRevRow>) {
    setRevisions((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const created = await api<{ id: string }>("/api/v1/product-lines", {
        method: "POST",
        body: {
          name: name.trim(),
          productName: productName.trim(),
          defaultArchitecture: defaultArchitecture.trim(),
          bootloaderRequirements: bootloaderRequirements.trim(),
          otaProviderId,
          compatibilityPolicy: compatibilityPolicy.trim() || "strict",
          supportedFirmwareVersions: supportedFirmwareVersions.split(",").map((s) => s.trim()).filter(Boolean),
          hardwareRevisions: revisions
            .filter((r) => r.revision.trim())
            .map((r) => ({
              revision: r.revision.trim(),
              architecture: r.architecture.trim() || defaultArchitecture.trim(),
              bootloaderRequirement: r.bootloaderRequirement.trim() || bootloaderRequirements.trim(),
            })),
        },
      });
      router.push(`/app/product-lines/${created.id}`);
    } catch (e: unknown) {
      setError(e instanceof ApiError ? `${e.message}${e instanceof ApiError ? ` (${e.code})` : ""}` : String(e));
      setBusy(false);
    }
  }

  const ownOrg = orgs.find((o) => o.id === user?.organisationId);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 18 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 4 }}>Hardware governance</div>
        <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Register product line</h1>
        <p style={{ fontSize: 13.5, color: "var(--fc-text-2)", marginTop: 6 }}>
          The line defines target hardware revisions, the bootloader requirement and the OTA provider.
          Releases must satisfy these constraints; registration is signature-attributed and audit-chained.
        </p>
      </div>

      <Panel>
        <PanelTitle>Line definition</PanelTitle>
        <Field label="Name">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ardane ST-7 (TX module)" autoFocus />
        </Field>
        <Field label="Product name">
          <input style={inputStyle} value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="ST-7 telemetry transmitter" />
        </Field>
        <Field label="Default architecture">
          <input style={inputStyle} value={defaultArchitecture} onChange={(e) => setDefaultArchitecture(e.target.value)} placeholder="armv7-m" />
        </Field>
        <Field label="Bootloader requirements" hint="Free text; hardware revisions inherit this if they do not override it.">
          <input style={inputStyle} value={bootloaderRequirements} onChange={(e) => setBootloaderRequirements(e.target.value)} placeholder="ST bootloader >=1.2 with RAM signature verify" />
        </Field>
        <Field label="OTA provider">
          <select style={inputStyle} value={otaProviderId} onChange={(e) => setOtaProviderId(e.target.value)}>
            {OTA_PROVIDERS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Field>
        <Field label="Compatibility policy" hint="strict — releases may only target declared hardware revisions.">
          <input style={inputStyle} value={compatibilityPolicy} onChange={(e) => setCompatibilityPolicy(e.target.value)} placeholder="strict" />
        </Field>
        <Field label="Supported firmware versions" hint="Comma-separated, e.g. 3.x, 4.0">
          <input style={inputStyle} value={supportedFirmwareVersions} onChange={(e) => setSupportedFirmwareVersions(e.target.value)} placeholder="3.x" />
        </Field>
      </Panel>

      <Panel>
        <PanelTitle
          right={
            <Button variant="ghost" onClick={() => setRevisions((rs) => [...rs, { revision: "", architecture: defaultArchitecture, bootloaderRequirement: "" }])}>
              Add revision
            </Button>
          }
        >
          Hardware revisions
        </PanelTitle>
        {revisions.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr auto", gap: 10, alignItems: "end", marginBottom: 10 }}>
            <Field label={i === 0 ? "Revision" : ""}>
              <input style={inputStyle} value={r.revision} onChange={(e) => setRev(i, { revision: e.target.value })} placeholder={`B${i + 1}`} />
            </Field>
            <Field label={i === 0 ? "Architecture" : ""}>
              <input style={inputStyle} value={r.architecture} onChange={(e) => setRev(i, { architecture: e.target.value })} placeholder="armv7-m" />
            </Field>
            <Field label={i === 0 ? "Bootloader requirement" : ""}>
              <input style={inputStyle} value={r.bootloaderRequirement} onChange={(e) => setRev(i, { bootloaderRequirement: e.target.value })} placeholder="inherit from line" />
            </Field>
            <div style={{ paddingBottom: i === 0 ? 22 : 16 }}>
              <Button variant="ghost" disabled={revisions.length <= 1} onClick={() => setRevisions((rs) => rs.filter((_, j) => j !== i))}>
                Remove
              </Button>
            </div>
          </div>
        ))}
        <div style={{ fontSize: 11.5, color: "var(--fc-text-2)", marginTop: 4 }}>
          At least one revision is required for a release to be proposed with target revisions.
        </div>
      </Panel>

      <Panel>
        <PanelTitle>Registry actor</PanelTitle>
        <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--fc-slate)" }}>
          <div><span style={{ color: "var(--fc-text-2)" }}>Owner organisation</span> · {user?.orgName ?? "—"} ({ownOrg?.type ?? "—"}), attached server-side from the session.</div>
          <div><span style={{ color: "var(--fc-text-2)" }}>Session</span> · <span className="mono" style={{ fontSize: 12 }}>{user?.email ?? "—"}</span></div>
          {orgs.length ? (
            <div style={{ fontSize: 12, color: "var(--fc-text-2)", marginTop: 6 }}>
              {orgs.length} organisation(s) registered on this deployment; releases will be cross-reviewed by the other parties.
            </div>
          ) : null}
        </div>
      </Panel>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <Button variant="ghost" href="/app/product-lines">Cancel</Button>
        <Button onClick={() => { void submit(); }} disabled={busy || !name.trim() || !productName.trim()}>
          {busy ? "Registering…" : "Register product line"}
        </Button>
      </div>
    </div>
  );
}
