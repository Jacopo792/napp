/* The page the phone's note screen loads into its WebView: the core's editor
 * for one note, and the whole of what crosses between the two.
 *
 * In: `window.napp`, set before this runs, says which note, as whom, and with
 * which access token; `window.nappToken` takes a fresh one. Out: where the
 * note stands, posted to the app. The page holds an access token and never a
 * refresh token: rotating the session is the app's alone, because two
 * clients rotating one refresh token is a reuse Supabase answers by revoking
 * every session in the family — the phone signed out. */
import { useRef, useState } from "react";
import { setAppearance } from "@/lib/appearance";
import { setAxes } from "@/lib/axes";
import { setWritingPreferences } from "@/lib/writingPreferences";
import type { AccountPreferences } from "@/lib/preferenceShape";
import { createRoot } from "react-dom/client";
import { HostedNote } from "@notes-app/core/hosted";
import { setPlatform } from "@notes-app/core/platform";
import "@notes-app/core/styles.css";
import type { AppSession } from "@/lib/session";
import { HostedRequests } from "@/lib/hostedRequests";
import type { HostedCommand, HostedController } from "@/lib/hostedCommands";
import { supabase } from "@/lib/supabaseClient";

interface Opening {
  session: AppSession;
  noteId: string;
  name: string;
  canEdit: boolean;
  accessToken: string | null;
  preferences: AccountPreferences;
  headerHeight: number;
}

declare global {
  interface Window {
    napp: Opening;
    nappUpdate: (next: Pick<Opening, "canEdit" | "name" | "preferences" | "headerHeight">) => void;
    nappToken: (accessToken: string) => void;
    nappCommand: (id: string, command: HostedCommand) => void;
    nappFileResult: (id: string, error?: string) => void;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

const adopt = (access_token: string) =>
  supabase.auth.setSession({ access_token, refresh_token: "held-by-the-app" });

supabase.auth.stopAutoRefresh();
window.nappToken = (accessToken) => void adopt(accessToken);
if (window.napp.accessToken) await adopt(window.napp.accessToken);

const post = (message: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));
const files = new HostedRequests();
window.nappFileResult = (id, error) => {
  files.settle(id, null, error);
};
async function nativeFile(
  operation: "save" | "open",
  name: string,
  data: Blob | string,
  type?: string,
) {
  const blob = typeof data === "string" ? new Blob([data], { type: type ?? "text/plain" }) : data;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  const id = crypto.randomUUID();
  return files.request<void>(
    id,
    () => {
      post({ kind: "file", id, operation, name, base64: btoa(binary), mime: blob.type });
    },
    180000,
  );
}
setPlatform({
  kind: "mobile",
  webOrigin: () => import.meta.env.VITE_WEB_ORIGIN as string,
  inviteToken: () => undefined,
  saveFile: (name, data, type) => nativeFile("save", name, data, type),
  saveFolder: async () => {
    throw new Error("Export individual notes from the phone");
  },
  openFile: async (name, load) => {
    await nativeFile("open", name, await load());
    return null;
  },
  print: async () => {
    throw new Error("Use Share as PDF to print this note");
  },
});

function Page() {
  const [opening, setOpening] = useState(window.napp);
  const editor = useRef<HostedController>(null);
  window.nappCommand = (id, command) => {
    const execute = async () => {
      if (!editor.current) throw new Error("The note is still loading");
      return editor.current.execute(command);
    };
    void execute().then(
      (value) => post({ kind: "result", id, value }),
      (error: unknown) =>
        post({ kind: "result", id, error: error instanceof Error ? error.message : String(error) }),
    );
  };
  window.nappUpdate = (next) => {
    document.documentElement.style.setProperty("--host-top", `${next.headerHeight}px`);
    setAppearance(next.preferences.appearance);
    setAxes(next.preferences.axes);
    setWritingPreferences(next.preferences.writing);
    setOpening((prev) => ({ ...prev, ...next }));
  };
  const { session, noteId, name, canEdit, preferences } = opening;
  return (
    <HostedNote
      ref={editor}
      onOpenNote={(noteId) => post({ kind: "link", noteId })}
      onOpenLink={() => post({ kind: "linkPrompt" })}
      onOpenComment={(threadId) => post({ kind: "commentOpen", threadId })}
      session={session}
      noteId={noteId}
      name={name}
      canEdit={canEdit}
      autocorrectOn={preferences.autocorrect}
      collaboratorsVisible={preferences.collaborators}
      onState={(state) => window.ReactNativeWebView?.postMessage(JSON.stringify(state))}
    />
  );
}
document.documentElement.style.setProperty("--host-top", `${window.napp.headerHeight}px`);
setAppearance(window.napp.preferences.appearance);
setAxes(window.napp.preferences.axes);
setWritingPreferences(window.napp.preferences.writing);
createRoot(document.getElementById("root")!).render(<Page />);
