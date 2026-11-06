/**
 * Marketing site chrome: sticky header, navy footer (with BOT Chain band)
 * and a small inner-page hero. Server-safe; only composes the shared
 * industrial component library from ./ui.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { BotFooterBand } from "./ui";

const NAV = [
  { href: "/platform", label: "Platform" },
  { href: "/release-governance", label: "Release governance" },
  { href: "/security", label: "Security" },
  { href: "/fleet-operators", label: "Who it's for" },
  { href: "/integrations", label: "Integrations" },
  { href: "/documentation", label: "Documentation" },
  { href: "/faq", label: "FAQ" },
] as const;

const CTA_HREF = "/sign-in";
const CTA_LABEL = "Open control room";

/** Small square governance mark (pure CSS, no logo asset needed). */
function WordmarkMark() {
  return (
    <span
      aria-hidden
      style={{
        width: 22, height: 22, flexShrink: 0, borderRadius: 4,
        border: "2px solid var(--fc-blue)", position: "relative",
        display: "inline-block",
      }}
    >
      <span style={{ position: "absolute", inset: 4, background: "var(--fc-blue)", borderRadius: 1 }} />
    </span>
  );
}

export function SiteHeader() {
  return (
    <header
      style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "var(--fc-surface)",
        borderBottom: "1px solid var(--fc-border)",
      }}
    >
      <div
        className="container"
        style={{
          display: "flex", alignItems: "center", gap: 28,
          padding: "14px 28px", flexWrap: "wrap",
        }}
      >
        <Link
          href="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            textDecoration: "none",
          }}
        >
          <WordmarkMark />
          <span style={{ fontSize: 16, fontWeight: 600, color: "var(--fc-navy)", letterSpacing: "-0.01em" }}>
            Firmware<span style={{ color: "var(--fc-blue)" }}>Council</span>
          </span>
        </Link>

        <nav
          aria-label="Primary"
          style={{
            display: "flex", gap: 20, marginLeft: "auto", flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              style={{
                fontSize: 13.5, fontWeight: 500, color: "var(--fc-slate)",
                textDecoration: "none", whiteSpace: "nowrap",
              }}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <a
          href={CTA_HREF}
          style={{
            background: "var(--fc-blue)", color: "#fff", border: "1px solid var(--fc-blue)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 600, padding: "9px 18px", borderRadius: 4,
            textDecoration: "none", whiteSpace: "nowrap",
          }}
        >
          {CTA_LABEL}
        </a>
      </div>
    </header>
  );
}

type FooterLink = { href: string; label: string };

const FOOTER_COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Product",
    links: [
      { href: "/platform", label: "Platform" },
      { href: "/release-governance", label: "Release governance" },
      { href: "/security", label: "Security model" },
      { href: "/integrations", label: "OTA integrations" },
    ],
  },
  {
    title: "Who it's for",
    links: [
      { href: "/hardware-manufacturers", label: "Hardware manufacturers" },
      { href: "/fleet-operators", label: "Fleet operators" },
      { href: "/release-governance", label: "Release train states" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/documentation", label: "Documentation" },
      { href: "/documentation#api", label: "REST API reference" },
      { href: "/integrations", label: "Adapter verification status" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms of use" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer style={{ marginTop: 72 }}>
      {/* Footer columns sit on the same navy surface as the BOT Chain band. */}
      <div style={{ background: "var(--fc-navy)", color: "#B7C3CD" }}>
        <div className="container" style={{ padding: "48px 28px 96px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 32 }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <WordmarkMark />
                <span style={{ fontSize: 16, fontWeight: 600, color: "#fff" }}>
                  Firmware<span style={{ color: "#7FA8C6" }}>Council</span>
                </span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.65, maxWidth: 300 }}>
                A governance and audit layer for multi-party firmware releases.
                FirmwareCouncil records decisions about updates — it is not an OTA
                delivery channel and never hosts firmware artifacts.
              </p>
            </div>
            {FOOTER_COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <div
                  style={{
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.08em",
                    textTransform: "uppercase", color: "#8FA1B0", marginBottom: 12,
                  }}
                >
                  {col.title}
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {col.links.map((l) => (
                    <li key={l.href + l.label} style={{ marginBottom: 8 }}>
                      <Link
                        href={l.href}
                        style={{ color: "#B7C3CD", fontSize: 13.5, textDecoration: "none" }}
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>
      </div>
      {/* BOT Chain official band (navbar navy + logo + chain 677/968 refs). */}
      <div style={{ marginTop: -60 }}>
        <BotFooterBand />
      </div>
    </footer>
  );
}

/** Wrapper so every marketing page carries the same chrome. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}

/** Honest verified/unverified marker for OTA adapters (same visual language as StatusPill). */
export function VerificationPill({ verified }: { verified: boolean }) {
  const tone = verified
    ? { bg: "#E9F3EE", fg: "var(--fc-green)" }
    : { bg: "var(--fc-pale-orange)", fg: "#B4600E" };
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        background: tone.bg, color: tone.fg,
        fontSize: 12, fontWeight: 600, letterSpacing: "0.04em",
        padding: "3px 10px", borderRadius: 3, textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 1, background: tone.fg, flexShrink: 0 }} />
      {verified ? "Verified" : "Unverified — sandbox testing required"}
    </span>
  );
}

/** Inner-page hero: eyebrow + h1 + sub, with a hairline base. */
export function PageHero({
  eyebrow, title, sub,
}: { eyebrow: string; title: string; sub: string }) {
  return (
    <section
      style={{
        borderBottom: "1px solid var(--fc-border)",
        background: "var(--fc-surface)",
      }}
    >
      <div className="container" style={{ padding: "64px 28px 56px" }}>
        <div className="eyebrow" style={{ marginBottom: 12 }}>{eyebrow}</div>
        <h1
          style={{
            fontSize: "clamp(1.9rem, 3.6vw, 2.7rem)", color: "var(--fc-navy)",
            lineHeight: 1.15, marginBottom: 14, maxWidth: 820,
          }}
        >
          {title}
        </h1>
        <p style={{ color: "var(--fc-text-2)", fontSize: 16.5, maxWidth: 720 }}>
          {sub}
        </p>
      </div>
    </section>
  );
}
