import { useState, type FormEvent } from "react";
import { createEphemeralClient } from "@/lib/supabaseClient";
import { NAPP_SAFETY_EMAIL } from "@/lib/storePolicies";

export function PublicSafetyNotice() {
  const [childSafety, setChildSafety] = useState(false);
  const [reference, setReference] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError("");
    setSending(true);
    try {
      const { data, error } = await createEphemeralClient().rpc("submit_safety_notice", {
        content_location: fields.get("location"),
        explanation: fields.get("explanation"),
        contact_name: fields.get("name"),
        contact_email: fields.get("email"),
        child_safety: childSafety,
        good_faith: fields.has("good-faith"),
      });
      if (error || typeof data !== "string") throw new Error("Notice submission failed");
      setReference(data);
    } catch {
      setError("Could not submit your notice. Try again or email the safety team.");
    } finally {
      setSending(false);
    }
  }

  if (reference) return <p role="status">Notice received. Reference {reference}.</p>;

  return (
    <form className="account-deletion" onSubmit={(event) => void submit(event)}>
      <label>
        URL where the content appears
        <input name="location" type="url" maxLength={2048} required />
      </label>
      <label>
        Why is the content illegal? Include details that help us locate it.
        <textarea name="explanation" maxLength={2000} required />
      </label>
      <label className="account-deletion-confirm">
        <input
          type="checkbox"
          checked={childSafety}
          onChange={(event) => setChildSafety(event.target.checked)}
        />
        This notice concerns child sexual abuse or exploitation.
      </label>
      <label>
        Name
        <input name="name" autoComplete="name" maxLength={200} required={!childSafety} />
      </label>
      <label>
        Email
        <input
          name="email"
          type="email"
          autoComplete="email"
          maxLength={254}
          required={!childSafety}
        />
      </label>
      <label className="account-deletion-confirm">
        <input type="checkbox" name="good-faith" required />I believe in good faith that the
        information in this notice is accurate and complete.
      </label>
      {error && (
        <p role="alert">
          {error} <a href={`mailto:${NAPP_SAFETY_EMAIL}`}>{NAPP_SAFETY_EMAIL}</a>
        </p>
      )}
      <button className="account-card-primary" type="submit" disabled={sending}>
        {sending ? "Sending…" : "Submit notice"}
      </button>
    </form>
  );
}
