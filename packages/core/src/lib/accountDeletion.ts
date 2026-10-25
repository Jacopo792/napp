import { createEphemeralClient, supabase } from "./supabaseClient";

export const ACCOUNT_DELETION_CONSEQUENCES =
  "Your account, profile, comments and notes will be permanently deleted, including your shared notes, their attachments and version history. Documents created by other people will stay, including your edits and any files needed by those documents. This cannot be undone.";

export interface AccountErasureReceipt {
  status: "processing" | "completed";
  requestToken: string;
}

/** A random receipt is a secret, not a user identifier. It lets a client
 * recover after a lost response even after the account has been deleted. */
export async function accountErasureStatus(requestToken: string) {
  const client = createEphemeralClient();
  const { data, error } = await client.rpc("account_erasure_status", {
    request_token: requestToken,
  });
  if (error) throw new Error("Could not check deletion. Please try again.");
  if (data !== "processing" && data !== "completed" && data !== "unknown")
    throw new Error("The server did not confirm the deletion status.");
  return data as "processing" | "completed" | "unknown";
}

export async function eraseAccount(
  userId: string,
  /** `null` for an account with no address, which has no password. */
  password: string | null,
  requestToken: string,
  client = supabase,
): Promise<AccountErasureReceipt> {
  if (!userId || password === "") throw new Error("Enter this account's password");
  const { data, error } = await client.functions.invoke("delete-account", {
    body: {
      action: "delete",
      confirm: true,
      expected_user_id: userId,
      password: password ?? "",
      request_token: requestToken,
    },
  });
  if (error) {
    // A timeout after submission can mean that deletion already finished.
    const status = await accountErasureStatus(requestToken).catch(() => "unknown" as const);
    if (status !== "unknown") return { status, requestToken };
    if ("context" in error && error.context instanceof Response && error.context.status === 403)
      throw new Error("The password is incorrect");
    throw new Error("Could not confirm deletion. Check your connection and try again.");
  }
  if (
    !data ||
    (data.status !== "completed" && data.status !== "processing") ||
    typeof data.requestToken !== "string"
  )
    throw new Error("The server did not confirm deletion. Please try again.");
  return { status: data.status, requestToken: data.requestToken };
}

/** The external page works without installing Napp or signing into an archive. */
export async function eraseAccountWithPassword(email: string, password: string, token: string) {
  const client = createEphemeralClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) {
    const status = await accountErasureStatus(token).catch(() => "unknown" as const);
    if (status !== "unknown") return { status, requestToken: token };
    throw new Error("Email or password is incorrect");
  }
  try {
    const result = await eraseAccount(data.user.id, password, token, client);
    return { ...result, userId: data.user.id };
  } finally {
    await client.auth.signOut({ scope: "local" });
  }
}
