import { useState } from "react";
import { otherAccounts } from "@/lib/session";
import { useArchive } from "./archive";
import { Avatar } from "./Avatar";
import { Line, Section, Status } from "./SettingsControls";
import { useChoice } from "./TextPrompt";

/** Saved sessions contain tokens, never passwords. Leaving forgets only this
 *  account. On the account page the face above already says who is signed
 *  in, so `current` is off there; Sign Out is always last and apart. */
export function Accounts() {
  return <>{useAccountCards(true)}</>;
}

/** The cards themselves, as a list, so a page that cascades can give each
 *  its own beat. */
export function useAccountCards(current: boolean) {
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
  return [
    error ? <Status key="error">{error}</Status> : null,
    current ? (
      <Section key="current" title="Current Account">
        <Line icon="person.crop.circle" label={session.email} />
      </Section>
    ) : null,
    <Section key="switch" title="Accounts">
      {saved.map((account) => (
        <Line
          key={account.userId}
          leading={
            <Avatar
              face={{ userId: account.userId, name: "", avatarObject: null }}
              email={account.email}
              size={32}
            />
          }
          label={account.email}
          opens
          disabled={busy}
          onPress={() => void run(() => switchAccount(account.userId))}
        />
      ))}
      <Line
        icon="person.badge.plus"
        label="Add Account"
        tone="action"
        disabled={busy}
        onPress={() => void run(addAccount)}
      />
    </Section>,
    <Section key="out">
      <Line
        icon="rectangle.portrait.and.arrow.right"
        label="Sign Out"
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
    </Section>,
  ];
}
