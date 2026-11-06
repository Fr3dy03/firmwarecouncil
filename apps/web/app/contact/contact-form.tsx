"use client";

import { useState } from "react";
import { Panel, Field, Button, inputStyle } from "../../components/fc/ui";

/**
 * Demo contact form — no backend wiring. Submit shows an explicit
 * confirmation message; nothing is sent or stored.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <Panel pad={24}>
        <div style={{ fontSize: 15.5, fontWeight: 600, color: "var(--fc-green)", marginBottom: 8 }}>
          Message received — demonstration only.
        </div>
        <p style={{ fontSize: 13.5, color: "var(--fc-slate)" }}>
          Thank you{name ? `, ${name}` : ""}. This is the demo form: nothing was sent or
          stored. On a production deployment this would route to the FirmwareCouncil team,
          who would reply to <span className="mono" style={{ fontSize: 12.5 }}>{email || "your email"}</span>.
        </p>
      </Panel>
    );
  }

  return (
    <Panel pad={24}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <Field label="Name">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ada Kepler" />
        </Field>
        <Field label="Organisation">
          <input style={inputStyle} value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Ardane Hardware" />
        </Field>
        <Field label="Work email">
          <input style={inputStyle} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@organisation.example" />
        </Field>
        <Field label="Message" hint="Questions about pilots, integrations or the governance model are all welcome.">
          <textarea
            style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            required
            placeholder="What are you trying to govern?"
          />
        </Field>
        <Button type="submit" full>Send message</Button>
        <div style={{ fontSize: 11.5, color: "var(--fc-text-2)", marginTop: 12 }}>
          Demo form — no data leaves your browser.
        </div>
      </form>
    </Panel>
  );
}
