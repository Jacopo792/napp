import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

/** The only shared Supabase client. Domain modules import it from here so they
 * do not need to depend on the archive loading and note persistence layer. */
export const supabase = createClient(url, publishableKey, {
  auth: {
    storage: typeof window === "undefined" ? undefined : window.sessionStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
