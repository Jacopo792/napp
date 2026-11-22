import { policyUrl } from "@/lib/storePolicies";

export function PolicyLinks() {
  return (
    <nav aria-label="Napp policies and support" className="policy-links">
      <a href={policyUrl("privacy")} target="_blank" rel="noopener noreferrer">
        Privacy
      </a>
      <a href={policyUrl("terms")} target="_blank" rel="noopener noreferrer">
        Terms
      </a>
      <a href={policyUrl("support")} target="_blank" rel="noopener noreferrer">
        Support
      </a>
      <a href={policyUrl("notice")} target="_blank" rel="noopener noreferrer">
        Report illegal content
      </a>
      <a href={policyUrl("contact")} target="_blank" rel="noopener noreferrer">
        DSA contact
      </a>
    </nav>
  );
}
