"use client";

/**
 * Organisation & session settings.
 * Endpoints (exact): GET /api/v1/auth/me → {user: SessionUser}; GET
 * /api/v1/users; GET /api/v1/organisations; POST /api/v1/invitations body
 * {email, name, organisationId, role, password} — route-gated to
 * PLATFORM_ADMIN or OPERATOR (routes/index.mts) and it creates the account
 * directly (honest note below); POST /api/v1/auth/logout revokes ONLY the
 * current session's opaque token (services/auth.mts revokes that token's
 * nonce — there is no server-side "sign out everywhere"), also stated on the page.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, clearSession, useSession, storedToken } from "../../../lib/api";
import { Button, ConfirmDialog, DataTable, Field, Modal, Panel, PanelTitle, StatusPill, inputStyle } from "../../../components/fc/ui";
import type { Organisation, SessionUser } from "../../../../../packages/shared/src/types";

interface UserRow { id: string; name: string; email: string; role: string; organisationId: string }

const ROLES = ["MANUFACTURER", "SECURITY_REVIEWER", "OPERATOR"] as const;

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

const ORG_TYPE_LABEL: Record<string, string> = {
  MANUFACTURER: "Manufacturer (proposes releases, signs artifacts)",
  OPERATOR: "Fleet operator (approves rollout, owns fleets)",
  SECURITY: "Security review (cross-org reviewer)",
  PLATFORM: "Platform",
};

export default function SettingsPage() {
  const { loading, user: sessionUser } = useSession();
  const router = useRouter();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [orgs, setOrgs] = useState<Organisation[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // invitation form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [inv, setInv] = useState({ email: "", name: "", organisationId: "", role: "MANUFACTURER", password: "" });
  const [mutating, setMutating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [signOutConfirm, setSignOutConfirm] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api<{ user: SessionUser }>("/api/v1/auth/me"),
      api<UserRow[]>("/api/v1/users"),
      api<Organisation[]>("/api/v1/organisations"),
    ]).then(([meR, usr, org]) => {
      if (!alive) return;
      const errs: string[] = [];
      if (meR.status === "fulfilled") setMe(meR.value.user);
      else if (meR.reason instanceof Error) errs.push(meR.reason.message);
      if (usr.status === "fulfilled") setUsers(usr.value);
      if (org.status === "fulfilled") setOrgs(org.value);
      setError(errs.length ? errs.join(" · ") : null);
      setBusy(false);
    });
    return () => { alive = false; };
  }, []);

  const u = me ?? sessionUser;
  const ownOrg = orgs.find((o) => o.id === u?.organisationId);
  const canInvite = u?.role === "PLATFORM_ADMIN" || u?.role === "OPERATOR";
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? id;

  const understandsToken = () => {
    const t = storedToken();
    if (!t) return "none";
    return t.split(".").length === 2 ? `opaque token (…${t.slice(-10)})` : "stored token";
  };

  async function invite() {
    setMutating(true);
    setFormError(null);
    try {
      await api("/api/v1/invitations", {
        method: "POST",
        body: {
          email: inv.email.trim(),
          name: inv.name.trim(),
          organisationId: inv.organisationId,
          role: inv.role,
          password: inv.password,
        },
      });
      const fresh = await api<UserRow[]>("/api/v1/users");
      setUsers(fresh);
      setInviteOpen(false);
      setConfirmInvite(false);
      setNotice(`Account created for ${inv.email.trim()} with role ${inv.role} at ${orgName(inv.organisationId)}.`);
      setInv({ email: "", name: "", organisationId: "", role: "MANUFACTURER", password: "" });
    } catch (e: unknown) {
      setFormError(e instanceof ApiError ? `${e.message} (${e.code})` : String(e));
      setConfirmInvite(false);
    } finally {
      setMutating(false);
    }
  }

  async function signOut() {
    try {
      await api("/api/v1/auth/logout", { method: "POST" });
    } catch {
      // network errors still leave the local session dead client-side
    }
    clearSession();
    router.replace("/sign-in");
  }

  if (loading || busy) {
    return <div className="mono" style={{ fontSize: 12.5, color: "var(--fc-text-2)" }}>Loading settings…</div>;
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 1020, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Configuration</div>
          <h1 style={{ fontSize: 24, color: "var(--fc-navy)" }}>Settings</h1>
        </div>
        <span style={{ flex: 1 }} />
        <StatusPill status={u?.role ?? "—"} />
      </div>

      {error ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {error}
        </div>
      ) : null}
      {notice ? (
        <div style={{ border: "1px solid var(--fc-green)", background: "#E9F3EE", color: "var(--fc-green)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {notice}
        </div>
      ) : null}
      {formError ? (
        <div style={{ border: "1px solid var(--fc-red)", background: "#F9E9E8", color: "var(--fc-red)", borderRadius: 4, padding: "9px 12px", fontSize: 13 }}>
          {formError}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 }}>
        <Panel>
          <PanelTitle>Session (GET /api/v1/auth/me)</PanelTitle>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, columnGap: 12, fontSize: 13 }}>
            <div style={{ color: "var(--fc-text-2)" }}>Name</div><div>{u?.name}</div>
            <div style={{ color: "var(--fc-text-2)" }}>Email</div><div className="mono" style={{ fontSize: 12 }}>{u?.email}</div>
            <div style={{ color: "var(--fc-text-2)" }}>Role</div><div><StatusPill status={u?.role ?? "—"} small /></div>
            <div style={{ color: "var(--fc-text-2)" }}>Organisation</div><div>{u?.orgName}</div>
          </div>
        </Panel>

        <Panel>
          <PanelTitle>Organisation</PanelTitle>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", rowGap: 6, columnGap: 12, fontSize: 13 }}>
            <div style={{ color: "var(--fc-text-2)" }}>Name</div><div>{ownOrg?.name ?? u?.orgName ?? "—"}</div>
            <div style={{ color: "var(--fc-text-2)" }}>Type</div><div>{ownOrg ? ORG_TYPE_LABEL[ownOrg.type] ?? ownOrg.type : "—"}</div>
            <div style={{ color: "var(--fc-text-2)" }}>Vendor address</div>
            <div className="mono" style={{ fontSize: 11.5, wordBreak: "break-all" }}>{ownOrg?.vendorAddress || "—"}</div>
            <div style={{ color: "var(--fc-text-2)" }}>Registered</div><div>{fmt(ownOrg?.createdAt)}</div>
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelTitle
          right={
            canInvite ? (
              <Button variant="secondary" onClick={() => {
                setInv((f) => ({ ...f, organisationId: f.organisationId || u?.organisationId || orgs[0]?.id || "" }));
                setFormError(null);
                setInviteOpen(true);
              }}>Invite / provision user</Button>
            ) : (
              <span style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>user provisioning is restricted to platform admins / operators</span>
            )
          }
        >
          People ({users.length})
        </PanelTitle>
        <DataTable
          minWidth={700}
          columns={[
            { key: "name", label: "Name" },
            { key: "email", label: "Email", mono: true },
            { key: "role", label: "Role", width: "170px" },
            { key: "org", label: "Organisation" },
          ]}
          rows={users.map((x) => ({
            name: <span style={{ fontWeight: 600, color: "var(--fc-navy)" }}>{x.name}</span>,
            email: <span className="mono" style={{ fontSize: 12 }}>{x.email}</span>,
            role: <StatusPill status={x.role} small />,
            org: <span style={{ fontSize: 12.5 }}>{orgName(x.organisationId)}</span>,
          }))}
        />
      </Panel>

      <Panel>
        <PanelTitle>Session security</PanelTitle>
        <div style={{ display: "grid", gap: 8, fontSize: 13, color: "var(--fc-slate)", lineHeight: 1.6 }}>
          <div>
            Session token (client-held, <span className="mono">localStorage</span>): <span className="mono" style={{ fontSize: 12 }}>{understandsToken()}</span>
          </div>
          <div>
            Tokens are HMAC-signed opaque credentials with a <strong>24-hour server-side expiry</strong>; each carries a
            revocable server nonce, so verification fails once a token is invalid, expired or revoked.
          </div>
          <div>
            <strong>Sign-out semantics:</strong> POST /api/v1/auth/logout revokes <em>the current session's token only</em>.
            Other sessions (other devices, other tabs sharing a different token) remain valid until they expire — the
            API exposes no "sign out everywhere" endpoint, so clearing every session requires rotating the platform secret.
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
            <Button variant="danger" onClick={() => setSignOutConfirm(true)}>Sign out</Button>
            <span style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
              Revokes this session token server-side and clears the local session store.
            </span>
          </div>
        </div>
      </Panel>

      {inviteOpen ? (
        <Modal
          title="Invite / provision user"
          onClose={() => { setInviteOpen(false); setFormError(null); }}
          footer={
            <>
              <Button variant="ghost" onClick={() => { setInviteOpen(false); setFormError(null); }}>Cancel</Button>
              <Button
                disabled={mutating || !inv.email.trim() || !inv.name.trim() || !inv.organisationId || !inv.password}
                onClick={() => setConfirmInvite(true)}
              >
                Prepare
              </Button>
            </>
          }
        >
          <Field label="Email">
            <input style={inputStyle} type="email" value={inv.email} onChange={(e) => setInv((f) => ({ ...f, email: e.target.value }))} placeholder="name@organisation.example" />
          </Field>
          <Field label="Full name">
            <input style={inputStyle} value={inv.name} onChange={(e) => setInv((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Organisation">
            <select style={inputStyle} value={inv.organisationId} onChange={(e) => setInv((f) => ({ ...f, organisationId: e.target.value }))}>
              <option value="">Select organisation…</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type})</option>)}
            </select>
          </Field>
          <Field label="Role">
            <select style={inputStyle} value={inv.role} onChange={(e) => setInv((f) => ({ ...f, role: e.target.value }))}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Initial password" hint="Communicated out-of-band; scrypt-hashed server-side.">
            <input style={inputStyle} type="password" value={inv.password} onChange={(e) => setInv((f) => ({ ...f, password: e.target.value }))} />
          </Field>
          <div style={{ fontSize: 11.5, color: "var(--fc-text-2)" }}>
            Note: the API currently provisions the account directly (email + initial password) rather than sending a
            mailbox invitation link. Only MANUFACTURER / SECURITY_REVIEWER / OPERATOR roles can be granted here.
          </div>
        </Modal>
      ) : null}

      {confirmInvite ? (
        <ConfirmDialog
          title="Create account"
          body={`Provision ${inv.email.trim()} as ${inv.role} at ${orgName(inv.organisationId)}? The API creates the account immediately with the provided initial password.`}
          confirmLabel={mutating ? "Creating…" : "Create"}
          onConfirm={() => { void invite(); }}
          onClose={() => setConfirmInvite(false)}
        />
      ) : null}

      {signOutConfirm ? (
        <ConfirmDialog
          title="Sign out"
          confirmLabel={mutating ? "Signing out…" : "Sign out"}
          body="Revoke the current session's token server-side and clear this browser's session store. Other sessions elsewhere are unaffected."
          onConfirm={() => { void signOut(); }}
          onClose={() => setSignOutConfirm(false)}
        />
      ) : null}
    </div>
  );
}
