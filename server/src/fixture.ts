/* Fixtures for the integration test: a real local Supabase, two real accounts,
   one real archive. Nothing here runs in production. */
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface LocalStack {
  apiUrl: string;
  publishableKey: string;
  serviceRoleKey: string;
}

export function localStack(): LocalStack | null {
  try {
    const status = JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
    return {
      apiUrl: status.API_URL,
      publishableKey: status.ANON_KEY,
      serviceRoleKey: status.SERVICE_ROLE_KEY,
    };
  } catch {
    return null;
  }
}

export interface Account {
  userId: string;
  email: string;
  /** What the archive holds for this account, and so what the server stamps
   *  into awareness however the client introduces itself. */
  nickname: string;
  token: string;
  client: SupabaseClient;
}

export async function makeAccount(stack: LocalStack, label: string): Promise<Account> {
  const admin = createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
  const password = "correct horse battery staple";
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(created.error.message);

  const client = createClient(stack.apiUrl, stack.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw new Error(signedIn.error.message);

  const userId = signedIn.data.user!.id;
  /* The application writes this row on first sign-in. The fixture signs in
     directly, so it has to write it too — without it `hide_archived` has no
     row to be true on, and the nickname the server stamps into awareness has
     nothing to come from. */
  const nickname = label.charAt(0).toUpperCase() + label.slice(1);
  // Plain insert, the way `ensureProfile()` does it: PostgREST's upsert takes
  // the `on conflict do update` path and that does not satisfy this table's
  // insert-only policy for `authenticated`.
  const profile = await client.from("profiles").insert({ user_id: userId, nickname });
  if (profile.error) throw new Error(profile.error.message);

  const token = signedIn.data.session!.access_token;
  return { userId, email, token, nickname, client };
}

export function asUser(stack: LocalStack, token: string): SupabaseClient {
  return createClient(stack.apiUrl, stack.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function asService(stack: LocalStack): SupabaseClient {
  return createClient(stack.apiUrl, stack.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
