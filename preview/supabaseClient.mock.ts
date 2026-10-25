/* Direct-client imports must be isolated too: safety and deletion screens in
 * a UI preview must never reach the production Auth or Functions endpoint. */
import { restoreSession } from "./session.mock";
import { POLICY_VERSION } from "../packages/core/src/lib/storePolicies";

async function user() {
  const session = await restoreSession();
  return session ? { id: session.userId, email: session.email, user_metadata: { napp_terms_version: POLICY_VERSION } } : null;
}
export const supabase = {
  auth: {
    getUser: async () => ({ data: { user: await user() }, error: null }),
    getSession: async () => ({ data: { session: { user: await user(), access_token: "preview-only" } }, error: null }),
    updateUser: async () => ({ data: { user: await user() }, error: null }),
    signInWithPassword: async () => ({ data: { user: null }, error: new Error("Unavailable in preview") }),
    signOut: async () => ({ error: null }),
    resetPasswordForEmail: async () => ({ error: new Error("Unavailable in preview") }),
    setSession: async () => ({ data: { user: null }, error: new Error("Unavailable in preview") }),
    startAutoRefresh: async () => {},
    stopAutoRefresh: async () => {},
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
  rpc: async () => ({ data: null, error: new Error("Unavailable in preview") }),
  from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
  functions: { invoke: async () => ({ data: null, error: new Error("Unavailable in preview") }) },
};
export const createEphemeralClient = () => supabase;
export function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
