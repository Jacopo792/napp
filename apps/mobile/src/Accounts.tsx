import { useEffect, useState } from "react";
import { router } from "expo-router";
import { forgetAccount, otherAccounts } from "@/lib/session";
import { useArchive, usePalette } from "./archive";
import { Avatar } from "./Avatar";
import { IconButton } from "./IconButton";
import { SymbolView } from "./icons";
import { Line, Section, Status } from "./SettingsControls";
import { useChoice } from "./TextPrompt";

/* The face and name an account wore when it was last open here. A saved
   account is not signed in, so its profile cannot be asked for; the phone
   remembers what it last saw. A picture in a private bucket may still be
   refused to the account in front, and the face then falls back to letters. */
const FACES_KEY = "napp:account-faces";
type Remembered = Record<string, { name: string; avatarObject: string | null }>;
function faces(): Remembered {
  try {
    const read = JSON.parse(localStorage.getItem(FACES_KEY) ?? "{}");
    return read && typeof read === "object" ? read : {};
  } catch {
    return {};
  }
}

/** Saved sessions contain tokens, never passwords. Leaving forgets only this
 *  account; Sign Out is always last and apart. */
export function Accounts() {
  return <>{useAccountCards()}</>;
}

/** The cards themselves, as a list, so a page that cascades can give each
 *  its own beat. The account in front is the first row, ticked; every account
 *  saved on this phone is under it, one press away, and Add Account keeps the
 *  one in front among them. */
export function useAccountCards() {
  const { session, profile, switchAccount, signOut } = useArchive();
  const anonymous = !session.email;
  const sheet = (mode: "save" | "sign-in") =>
    router.push({ pathname: "/sign-in", params: { mode } });
  const palette = usePalette();
  const [, forgot] = useState(0);
  const saved = otherAccounts(session.userId);
  const remembered = faces();
  const choose = useChoice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!profile) return;
    try {
      localStorage.setItem(
        FACES_KEY,
        JSON.stringify({
          ...faces(),
          [session.userId]: { name: profile.nickname, avatarObject: profile.avatarObject },
        }),
      );
    } catch {
      // Only a face; the row still says the address.
    }
  }, [profile, session.userId]);
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
  const forget = (userId: string, email: string) =>
    choose(email, [
      {
        label: "Remove from This Phone",
        icon: "trash",
        destructive: true,
        run: () => {
          forgetAccount(userId);
          forgot((n) => n + 1);
        },
      },
    ]);
  return [
    error ? <Status key="error">{error}</Status> : null,
    <Section key="switch" title="Accounts">
      <Line
        leading={
          <Avatar
            face={{
              userId: session.userId,
              name: profile?.nickname ?? "",
              avatarObject: profile?.avatarObject ?? null,
            }}
            email={session.email}
            size={32}
          />
        }
        label={profile?.nickname || session.email || "This Phone"}
        note={anonymous ? "Not saved" : profile?.nickname ? session.email : undefined}
        accessibilityLabel={`${session.email}, current account`}
        trailing={
          <SymbolView name="checkmark" size={17} weight="semibold" tintColor={palette.ink} />
        }
      />
      {saved.map((account) => {
        const face = remembered[account.userId];
        return (
          <Line
            key={account.userId}
            leading={
              <Avatar
                face={{
                  userId: account.userId,
                  name: face?.name ?? "",
                  avatarObject: face?.avatarObject ?? null,
                }}
                email={account.email}
                size={32}
              />
            }
            label={face?.name || account.email}
            note={face?.name ? account.email : undefined}
            accessibilityLabel={`Switch to ${account.email}`}
            disabled={busy}
            onPress={() => void run(() => switchAccount(account.userId))}
            onLongPress={() => forget(account.userId, account.email)}
            trailing={
              <IconButton
                icon="ellipsis"
                label={`Options for ${account.email}`}
                disabled={busy}
                onPress={() => forget(account.userId, account.email)}
              />
            }
          />
        );
      })}
      {anonymous ? (
        <Line
          icon="person.badge.plus"
          label="Save Your Notes"
          disabled={busy}
          onPress={() => sheet("save")}
        />
      ) : null}
      <Line
        icon={anonymous ? "rectangle.portrait.and.arrow.right" : "person.badge.plus"}
        label={anonymous ? "Sign In" : "Add Account"}
        disabled={busy}
        onPress={() => sheet("sign-in")}
      />
    </Section>,
    anonymous ? null : (
      <Section key="out">
        <Line
          icon="rectangle.portrait.and.arrow.right"
          label="Sign Out"
          tone="danger"
          disabled={busy}
          onPress={() =>
            choose("Remove local copies and sign out?", [
              {
                label: "Sign Out and Clear Local Copies",
                detail: "Unsynced edits on this device will be deleted.",
                icon: "rectangle.portrait.and.arrow.right",
                destructive: true,
                run: () => void run(signOut),
              },
            ])
          }
        />
      </Section>
    ),
  ];
}
