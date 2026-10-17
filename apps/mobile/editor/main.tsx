/* The page the phone's note screen loads into its WebView: the core's editor
 * for one note, and the whole of what crosses between the two.
 *
 * In: `window.napp`, set before this runs, says which note, as whom, and with
 * which access token; `window.nappToken` takes a fresh one. Out: where the
 * note stands, posted to the app. The page holds an access token and never a
 * refresh token: rotating the session is the app's alone, because two
 * clients rotating one refresh token is a reuse Supabase answers by revoking
 * every session in the family — the phone signed out. */
import { createRoot } from "react-dom/client";
import { HostedNote } from "@notes-app/core/hosted";
import { setPlatform } from "@notes-app/core/platform";
import "@notes-app/core/styles.css";
import type { AppSession } from "@/lib/session";
import { supabase } from "@/lib/supabaseClient";

interface Opening {
  session: AppSession;
  noteId: string;
  name: string;
  canEdit: boolean;
  accessToken: string | null;
}

declare global {
  interface Window {
    napp: Opening;
    nappToken: (accessToken: string) => void;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

const adopt = (access_token: string) =>
  supabase.auth.setSession({ access_token, refresh_token: "held-by-the-app" });

supabase.auth.stopAutoRefresh();
window.nappToken = (accessToken) => void adopt(accessToken);
if (window.napp.accessToken) await adopt(window.napp.accessToken);

/* ponytail: files and print stay with the app's own screens for now; nothing
   in one note's editor reaches them yet. */
const nowhere = () => Promise.reject(new Error("Not on the phone yet"));
setPlatform({
  kind: "mobile",
  webOrigin: () => import.meta.env.VITE_WEB_ORIGIN as string,
  inviteToken: () => undefined,
  saveFile: nowhere,
  saveFolder: nowhere,
  openFile: nowhere,
  print: async () => {},
});

const { session, noteId, name, canEdit } = window.napp;
createRoot(document.getElementById("root")!).render(
  <HostedNote
    session={session}
    noteId={noteId}
    name={name}
    canEdit={canEdit}
    onState={(state) => window.ReactNativeWebView?.postMessage(JSON.stringify(state))}
  />,
);
