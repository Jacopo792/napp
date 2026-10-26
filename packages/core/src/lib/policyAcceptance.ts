import { supabase } from "./supabaseClient";
import { POLICY_VERSION } from "./storePolicies";

/* Accepting is a fact about the account that only moves forward, so this
   device remembers it: a launch then opens the archive at once, offline too,
   instead of waiting on Auth — and a slow answer never flashes the form at
   somebody who agreed long ago. */
const acceptedKey = (userId: string) => `napp:policies-accepted:${userId}`;

export function acceptedHere(userId: string): boolean {
  try {
    return localStorage.getItem(acceptedKey(userId)) === POLICY_VERSION;
  } catch {
    return false;
  }
}

function remember(userId: string): void {
  try {
    localStorage.setItem(acceptedKey(userId), POLICY_VERSION);
  } catch {
    /* Without storage the next launch asks Auth again, as before. */
  }
}

export async function loadPolicyAcceptance(userId: string): Promise<boolean> {
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== userId)
    throw new Error("Could not verify this account. Please try again.");
  const accepted = data.user.user_metadata?.napp_terms_version === POLICY_VERSION;
  if (accepted) remember(userId);
  return accepted;
}

export async function acceptPolicies(userId: string): Promise<void> {
  const current = await supabase.auth.getUser();
  if (current.error || current.data.user?.id !== userId)
    throw new Error("Sign in to this account again");
  const { error } = await supabase.auth.updateUser({
    data: {
      napp_terms_version: POLICY_VERSION,
      napp_privacy_version: POLICY_VERSION,
      napp_policies_accepted_at: new Date().toISOString(),
    },
  });
  if (error) throw new Error("Could not save your acceptance. Please try again.");
  remember(userId);
}
