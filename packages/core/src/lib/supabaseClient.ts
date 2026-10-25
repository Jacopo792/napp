import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** Isolated auth for the external deletion page and receipt checks. It never
 * replaces the app's saved account or persists a password/session. */
export function createEphemeralClient() {
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** The only shared Supabase client. Domain modules import it from here so they
 * do not need to depend on the archive loading and note persistence layer. */
export const supabase = createClient(url, publishableKey, {
  auth: {
    /* `sessionStorage` is erased with an Electron window, which made closing
       the desktop app indistinguishable from signing out. The refresh token is
       kept in this origin's local storage and revoked on explicit sign-out. */
    storage: typeof window === "undefined" ? undefined : window.localStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
