import { createClient } from "@supabase/supabase-js";

/* Some account/safety panels import the client even before being opened.
   Keep those imports credential-free and refuse every network operation.
   The preview's persistence modules supply their own in-memory fixtures. */
export function createEphemeralClient() {
  return createClient("https://preview.example.invalid", "preview-only", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async () => {
        throw new Error("Account operations are unavailable in the UI preview.");
      },
    },
  });
}

export const supabase = createEphemeralClient();

export function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
