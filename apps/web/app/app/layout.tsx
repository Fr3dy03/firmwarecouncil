"use client";

/**
 * Authenticated control-room shell: session gate + role-scoped navigation.
 * Pages under /app/* render inside this layout; unauthenticated visitors
 * are redirected to /sign-in.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession, logout } from "../../lib/api";

type NavItem = { href: string; label: string; roles?: string[] };

const NAV: NavItem[] = [
  { href: "/app", label: "Command" },
  { href: "/app/product-lines", label: "Product lines", roles: ["MANUFACTURER", "PLATFORM_ADMIN"] },
  { href: "/app/releases", label: "Releases" },
  { href: "/app/approvals", label: "Approvals", roles: ["SECURITY_REVIEWER", "OPERATOR", "PLATFORM_ADMIN"] },
  { href: "/app/rollouts", label: "Rollouts", roles: ["OPERATOR", "PLATFORM_ADMIN", "MANUFACTURER"] },
  { href: "/app/fleets", label: "Fleets", roles: ["OPERATOR", "PLATFORM_ADMIN"] },
  { href: "/app/incidents", label: "Incidents" },
  { href: "/app/signing-keys", label: "Signing keys" },
  { href: "/app/integrations", label: "Integrations", roles: ["MANUFACTURER", "OPERATOR", "PLATFORM_ADMIN"] },
  { href: "/app/audit", label: "Audit" },
  { href: "/app/settings", label: "Settings" },
];

const ROLE_LABEL: Record<string, string> = {
  MANUFACTURER: "Manufacturer",
  SECURITY_REVIEWER: "Security review",
  OPERATOR: "Fleet operator",
  PLATFORM_ADMIN: "Platform admin",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { loading, user } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/sign-in");
  }, [loading, user, router]);

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--fc-text-2)" }}>
        <div className="mono" style={{ fontSize: 13 }}>Establishing session…</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--fc-text-2)" }}>
        <div className="mono" style={{ fontSize: 13 }}>Redirecting to sign-in…</div>
      </main>
    );
  }

  const items = NAV.filter((n) => !n.roles || n.roles.includes(user.role) || user.role === "PLATFORM_ADMIN");
  const orgTone = user.role === "SECURITY_REVIEWER" ? "var(--fc-green)" : user.role === "OPERATOR" ? "var(--fc-orange)" : "var(--fc-blue)";

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          background: "var(--fc-navy)",
          color: "#fff",
          borderBottom: "2px solid var(--fc-blue)",
        }}
      >
        <div className="container" style={{ padding: "0 28px", display: "flex", alignItems: "center", gap: 26, minHeight: 62 }}>
          <Link href="/app" style={{ display: "flex", alignItems: "baseline", gap: 10, textDecoration: "none" }}>
            <span style={{ fontSize: 16.5, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>FirmwareCouncil</span>
            <span style={{ fontSize: 10.5, letterSpacing: "0.1em", color: "#8FA1B0", textTransform: "uppercase" }}>Control room</span>
          </Link>
          <span style={{ flex: 1 }} />
          <div style={{ textAlign: "right", lineHeight: 1.35 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 11.5, color: "#9DB2C1" }}>
              <span style={{ color: orgTone, fontWeight: 600 }}>{ROLE_LABEL[user.role] ?? user.role}</span>
              {" · "}
              {user.orgName}
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              router.replace("/sign-in");
            }}
            style={{
              background: "transparent", border: "1px solid #3B4E63", color: "#9DB2C1",
              fontSize: 12.5, fontWeight: 600, padding: "7px 14px", borderRadius: 4, cursor: "pointer",
            }}
            className="app-signout"
          >
            Sign out
          </button>
        </div>
        <div className="container" style={{ padding: "0 28px" }}>
          <nav style={{ display: "flex", gap: 2, overflowX: "auto" }}>
            {items.map((n) => {
              const active = n.href === "/app" ? pathname === "/app" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  style={{
                    padding: "9px 13px 11px",
                    fontSize: 13,
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                    color: active ? "#fff" : "#93A8B8",
                    borderBottom: active ? "3px solid var(--fc-orange)" : "3px solid transparent",
                    textDecoration: "none",
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="container" style={{ flex: 1, width: "100%", padding: "28px 28px 70px" }}>{children}</main>
      <footer style={{ borderTop: "1px solid var(--fc-border)", background: "var(--fc-surface)" }}>
        <div className="container" style={{ padding: "14px 28px", display: "flex", gap: 18, alignItems: "center", fontSize: 11.5, color: "var(--fc-text-2)" }}>
          <span className="mono">BOT Chain 677 / 968</span>
          <span>·</span>
          <span>Every decision is signature-bound and audit-chained</span>
          <span style={{ flex: 1 }} />
          <Link href="/" style={{ color: "var(--fc-text-2)" }}>Marketing site</Link>
          <a href="https://scan.botchain.ai/" target="_blank" rel="noreferrer">BOT Chain Explorer ↗</a>
        </div>
      </footer>
    </div>
  );
}
