import { createEphemeralClient } from "./supabaseClient";
import { platform } from "@/platform";

export function passwordRecoveryUrl(): string {
  const url = new URL(platform().webOrigin());
  url.searchParams.set("action", "reset-password");
  return url.toString();
}

export function recoveryTokens(fragment: string) {
  const values = new URLSearchParams(fragment.replace(/^#/, ""));
  if (values.get("type") !== "recovery") return null;
  const access_token = values.get("access_token");
  const refresh_token = values.get("refresh_token");
  return access_token && refresh_token ? { access_token, refresh_token } : null;
}

/** Recovery never replaces a different account already open in the app. */
export function passwordRecovery() {
  const client = createEphemeralClient();
  let verified = false;
  return {
    async request(email: string) {
      if (!email.trim()) throw new Error("Enter your account email.");
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: passwordRecoveryUrl(),
      });
      if (error) throw new Error("Could not send the recovery email. Please try again later.");
    },
    async verify(fragment: string) {
      const tokens = recoveryTokens(fragment);
      if (!tokens) throw new Error("This recovery link is invalid. Request a new email.");
      const { data, error } = await client.auth.setSession(tokens);
      if (error || !data.user)
        throw new Error("This recovery link has expired. Request a new email.");
      verified = true;
    },
    async save(password: string) {
      if (!verified) throw new Error("Open the recovery link from your email first.");
      if (password.length < 8) throw new Error("Use at least 8 characters.");
      const { error } = await client.auth.updateUser({ password });
      if (error)
        throw new Error("Could not update the password. Request a new link and try again.");
      verified = false;
      await client.auth.signOut({ scope: "local" });
    },
  };
}
