import { policyUrl } from "@/lib/storePolicies";

export function PolicyLinks() {
  return (
    <nav
      aria-label="Napp policies and support"
      style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13 }}
    >
      <a href={policyUrl("privacy")} target="_blank" rel="noopener noreferrer">
        Privacy
      </a>
      <a href={policyUrl("terms")} target="_blank" rel="noopener noreferrer">
        Terms
      </a>
      <a href={policyUrl("support")} target="_blank" rel="noopener noreferrer">
        Support
      </a>
    </nav>
  );
}
