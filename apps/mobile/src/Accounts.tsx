import { useState } from "react";
import { otherAccounts } from "@/lib/session";
import { useArchive } from "./archive";
import { Line, Section, Status } from "./SettingsControls";
import { useChoice } from "./TextPrompt";

/** Saved sessions contain tokens, never passwords. Leaving forgets only this account. */
export function Accounts() {
  const { session, addAccount, switchAccount, signOut } = useArchive();
  const saved = otherAccounts(session.userId);
  const choose = useChoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {error ? <Status>{error}</Status> : null}
      <Section title="Current Account">
        <Line icon="person.crop.circle" label={session.email} note="Signed in on this phone" />
      </Section>
      {saved.length ? (
        <Section title="Switch Account">
          {saved.map((account) => (
            <Line
              key={account.userId}
              icon="person"
              label={account.email}
              note="Saved on this phone"
              opens
              disabled={busy}
              onPress={() => void run(() => switchAccount(account.userId))}
            />
          ))}
        </Section>
      ) : null}
      <Section>
        <Line
          icon="person.badge.plus"
          label="Add Account"
          note="Keep this account ready to return to"
          opens
          disabled={busy}
          onPress={() => void run(addAccount)}
        />
      </Section>
      <Section>
        <Line
          icon="rectangle.portrait.and.arrow.right"
          label="Sign Out of This Account"
          note="Other saved accounts stay on this phone"
          tone="danger"
          disabled={busy}
          onPress={() =>
            choose("Sign out?", [
              {
                label: "Sign Out",
                detail: session.email,
                icon: "rectangle.portrait.and.arrow.right",
                destructive: true,
                run: () => void run(signOut),
              },
            ])
          }
        />
      </Section>
    </>
  );
}
