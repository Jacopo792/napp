/** What an emailed Auth link says once opened. Read before the fragment is
 *  dropped: its tokens must not stay in history, and the app does not sign
 *  in from a link (`detectSessionInUrl: false`). */
export function authLinkResult(hash: string): { title: string; text: string } | null {
  const values = new URLSearchParams(hash.replace(/^#/, ""));
  if (values.get("error"))
    return { title: "This link has expired", text: "Ask Napp for a new email and open it." };
  if (values.get("message"))
    return {
      title: "One more link",
      text: "Open the link sent to your other address to finish the change.",
    };
  if (values.get("type") === "signup")
    return { title: "Address confirmed", text: "Sign in with your email and password." };
  if (values.get("type") === "email_change")
    return { title: "Email changed", text: "Sign in with your new address." };
  return null;
}
