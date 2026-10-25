/* The shared client, for the modules that import it directly rather than
   through `@/lib/supabase` — pasting an image asks it for the session's token.
   Without this the preview built a real client with no URL, and the editor's
   chunk threw "supabaseUrl is required" the moment a list of notes opened. A
   preview reaches no Auth endpoint, so every answer is empty. */
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    getUser: async () => ({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};

export function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
