/* Direct-client imports must be isolated too: safety and deletion screens in
 * a UI preview must never reach the production Auth or Functions endpoint. */
import { restoreSession } from "./session.mock";
import { PREVIEW_PLUS } from "./stripe.mock";
import { POLICY_VERSION } from "../packages/core/src/lib/storePolicies";

async function user() {
  const session = await restoreSession();
  return session ? { id: session.userId, email: session.email, user_metadata: { napp_terms_version: POLICY_VERSION } } : null;
}
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const USAGE = [
  ["Jacopo", "jacopo@example.com", "web", "Mac", "macOS", "Safari", 0],
  ["Jacopo", "jacopo@example.com", "mobile", "iPhone", "iOS", null, 42],
  ["Marta", "marta@example.com", "desktop", "Mac", "macOS", null, 190],
  ["", "luca@example.com", "web", "Windows PC", "Windows", "Chrome", 4000],
].map(([nickname, email, client, device, os, browser, ago], i) => ({
  user_id: `u${i}`, email, nickname, device_id: `d${i}`, client, device, os, browser,
  first_seen_at: minutesAgo(99999), last_active_at: minutesAgo(ago as number), total_count: 4,
}));
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
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      let subscribed = true;
      void user().then((account) => {
        if (subscribed) callback("INITIAL_SESSION", account && { user: account });
      });
      return { data: { subscription: { unsubscribe() { subscribed = false; } } } };
    },
  },
  rpc: async (name: string) =>
    name === "report_safety_issue" || name === "submit_safety_notice"
      ? { data: "8c487023-b897-4032-972b-037956b0df2c", error: null }
      : name === "accept_policies"
      ? { data: null, error: null }
      : name === "has_accepted_policies" || name === "is_usage_administrator"
      ? { data: true, error: null }
      : name === "list_usage_activity"
        ? { data: USAGE, error: null }
        : { data: null, error: new Error("Unavailable in preview") },
  from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
  functions: {
    invoke: async (name: string, options?: { body?: { action?: string; interval?: string } }) => {
      if (name !== "stripe-billing")
        return { data: null, error: new Error("Unavailable in preview") };
      await new Promise((done) => setTimeout(done, 900));
      /* The billing portal stand-in cancels: the next visit is the checkout again. */
      if (options?.body?.action === "portal") {
        sessionStorage.removeItem(PREVIEW_PLUS);
        return { data: { url: `${location.pathname}?action=billing&interval=year` }, error: null };
      }
      return sessionStorage.getItem(PREVIEW_PLUS)
        ? { data: { status: "manage" }, error: null }
        : { data: { clientSecret: `cs_preview_${options?.body?.interval ?? "year"}`, email: (await user())?.email }, error: null };
    },
  },
};
export const createEphemeralClient = () => supabase;
export function fail(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
