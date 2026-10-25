import { PolicyLinks } from "@/components/PolicyLinks";
import {
  deletionUrl,
  NAPP_CONTROLLER,
  NAPP_SUPPORT_EMAIL,
  POLICY_VERSION,
  PRIVACY_SECTIONS,
  TERMS_SECTIONS,
} from "@/lib/storePolicies";
import "@/components/accountDeletion.css";

export default function Policy() {
  const kind = new URLSearchParams(window.location.search).get("page");
  const sections = kind === "privacy" ? PRIVACY_SECTIONS : kind === "terms" ? TERMS_SECTIONS : [];
  return (
    <main className="account-deletion-page" style={{ alignContent: "start" }}>
      <article style={{ maxWidth: "42rem", display: "grid", gap: "1.5rem" }}>
        <h1>
          {kind === "privacy"
            ? "Napp privacy policy"
            : kind === "terms"
              ? "Napp terms of use"
              : "Napp support"}
        </h1>
        <p>
          {NAPP_CONTROLLER} · Updated {POLICY_VERSION}
        </p>
        {sections.map(({ title, text }) => (
          <section key={title}>
            <h2 style={{ fontWeight: 600, marginBottom: 8 }}>{title}</h2>
            <p style={{ lineHeight: 1.7 }}>{text}</p>
          </section>
        ))}
        <p>
          For assistance, privacy requests or abuse reports:{" "}
          <a href={`mailto:${NAPP_SUPPORT_EMAIL}`}>{NAPP_SUPPORT_EMAIL}</a>.
        </p>
        <p>
          <a href={deletionUrl()}>Delete your Napp account</a>
        </p>
        <PolicyLinks />
      </article>
    </main>
  );
}
