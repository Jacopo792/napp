/* The account sheet. Saving links an address to the account in front, so the
 * notes never move; signing in or creating another account leaves it. */
import { router, useLocalSearchParams } from "expo-router";
import {
  authenticate,
  checkCredentials,
  linkAccount,
  pauseAccount,
  registerAccount,
} from "@/lib/session";
import { useArchive } from "../archive";
import { SignIn } from "../SignIn";

export default function AccountSheet() {
  const { mode } = useLocalSearchParams<{ mode?: "save" | "sign-in" }>();
  const { session, snapshot, changeAccount, adoptSession, switchAccount } = useArchive();
  const anonymous = !session.email;
  const notes = snapshot?.entries.length ?? 0;
  return (
    <SignIn
      initialMode={mode === "sign-in" || !anonymous ? "sign-in" : "sign-up"}
      saving={anonymous}
      warning={anonymous && notes ? "Signing in leaves the notes on this phone behind." : undefined}
      onSession={adoptSession}
      onResume={switchAccount}
      onCancel={() => router.back()}
      onSubmit={async (chosen, email, password) => {
        if (chosen === "sign-up" && anonymous) {
          adoptSession(await linkAccount(session, email, password, true));
          return router.back();
        }
        // Checked on a client of its own: a wrong password leaves this account open.
        if (chosen === "sign-in") await checkCredentials(email, password);
        await changeAccount(async () => {
          if (!anonymous) await pauseAccount();
          if (chosen === "sign-in")
            return authenticate(email, password, undefined, { notesOnly: true });
          const created = await registerAccount(email, password, true);
          return created.confirmationRequired ? null : created;
        });
      }}
    />
  );
}
