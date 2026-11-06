import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "../../components/fc/ui";
import { SiteShell, PageHero } from "../../components/fc/site";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = {
  title: "Contact",
  description: "Contact the FirmwareCouncil team about pilots, integrations and the governance model.",
};

export default function ContactPage() {
  return (
    <SiteShell>
      <PageHero
        eyebrow="Contact"
        title="Talk to us about governing your releases."
        sub="Pilots with a device simulator fleet, sandbox qualification for Mender or hawkBit, or a walkthrough of the audit trail with your security team."
      />

      <section className="section-pad">
        <div className="container" style={{ display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 32, alignItems: "start" }}>
          <div>
            <ContactForm />
          </div>
          <div>
            <Panel pad={24} style={{ marginBottom: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Direct channels</div>
              <div style={{ display: "grid", gap: 14, fontSize: 13.5, color: "var(--fc-slate)" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fc-text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    General
                  </div>
                  <span className="mono" style={{ fontSize: 13 }}>hello@firmwarecouncil.example</span>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fc-text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Security &amp; audit
                  </div>
                  <span className="mono" style={{ fontSize: 13 }}>security@firmwarecouncil.example</span>
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fc-text-2)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Response window
                  </div>
                  Within one business day.
                </div>
              </div>
            </Panel>
            <Panel pad={24}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>Before you write</div>
              <div style={{ fontSize: 13.5, color: "var(--fc-slate)", display: "grid", gap: 8 }}>
                <Link href="/faq">The FAQ answers the most common evaluation questions</Link>
                <Link href="/integrations">Integration verification status is documented openly</Link>
                <Link href="/documentation#api">The complete REST API surface is listed in the docs</Link>
                <Link href="/sign-in">The demo control room needs no sign-up</Link>
              </div>
            </Panel>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
