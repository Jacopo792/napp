/* The page the phone's note screen loads into its WebView: the core's editor
 * for one note, and the whole of what crosses between the two.
 *
 * In: `window.napp`, set before this runs, says which note, as whom, and with
 * which access token; `window.nappToken` takes a fresh one. Out: where the
 * note stands, posted to the app. The page holds an access token and never a
 * refresh token: rotating the session is the app's alone, because two
 * clients rotating one refresh token is a reuse Supabase answers by revoking
 * every session in the family — the phone signed out. */
import { useEffect, useRef, useState } from "react";
import { setAppearance } from "@/lib/appearance";
import { setAxes } from "@/lib/axes";
import { setWritingPreferences } from "@/lib/writingPreferences";
import type { AccountPreferences } from "@/lib/preferenceShape";
import { createRoot } from "react-dom/client";
import { HostedNote } from "@notes-app/core/hosted";
import { setPlatform } from "@notes-app/core/platform";
import "@notes-app/core/styles.css";
import type { AppSession } from "@/lib/session";
import { HostedRequests, tokenUsable } from "@/lib/hostedRequests";
import { wakeCollaboration } from "@/lib/collab";
import type { HostedCommand, HostedController } from "@/lib/hostedCommands";
import { supabase } from "@/lib/supabaseClient";
import type { Note as StoredNote } from "@/lib/types";

interface Opening {
  session: AppSession;
  /** Null between notes: the page is the session's, lent to the note in
   *  front, and shows nothing while nobody holds it. */
  noteId: string | null;
  name: string;
  canEdit: boolean;
  accessToken: string | null;
  preferences: AccountPreferences;
  headerHeight: number;
  previewSeed?: StoredNote;
}

type Note = Pick<
  Opening,
  "noteId" | "canEdit" | "name" | "preferences" | "headerHeight" | "previewSeed"
>;

declare global {
  interface Window {
    nappPreviewSeed?: (note: StoredNote) => void;
    napp: Opening;
    nappUpdate: (next: Note) => void;
    nappOpen: (next: Note | null) => void;
    nappToken: (accessToken: string) => void;
    nappWake: () => void;
    nappCommand: (id: string, command: HostedCommand) => void;
    nappFileResult: (id: string, error?: string) => void;
    ReactNativeWebView?: { postMessage(message: string): void };
  }
}

const post = (message: unknown) => window.ReactNativeWebView?.postMessage(JSON.stringify(message));

/* The page's whole idea of who it is: the app's access token, asked for again
   whenever it is about to lapse. It used to be `setSession` with a stand-in
   refresh token, which auth-js then tried to *use*: after the phone had been
   asleep longer than the token lives, the first reconnect read an expired
   session, the refresh with the stand-in failed, the page signed itself out —
   and `collab.ts` answers SIGNED_OUT by destroying every open document,
   including the one on screen. The note sat on its spinner for ever. Every
   reader in the page (the collaboration socket, PostgREST, Storage, Realtime)
   asks `getSession`, so answering it here is the whole boundary. */
let accessToken = window.napp.accessToken;
const waiting = new Set<() => void>();
supabase.auth.stopAutoRefresh();
window.nappToken = (next) => {
  accessToken = next;
  for (const resolve of waiting) resolve();
  waiting.clear();
};
window.nappWake = () => wakeCollaboration();
async function currentToken(): Promise<string | null> {
  if (tokenUsable(accessToken, Date.now())) return accessToken;
  post({ kind: "token" });
  await new Promise<void>((resolve) => {
    waiting.add(resolve);
    setTimeout(resolve, 15000);
  });
  return accessToken;
}
supabase.auth.getSession = (async () => {
  const token = await currentToken();
  return { data: { session: token ? { access_token: token } : null }, error: null };
}) as unknown as typeof supabase.auth.getSession;
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
  const adopt = (next: Note) => {
    if (window.nappPreviewSeed && next.noteId) {
      // Wait for the native snapshot before creating a preview document.
      if (!next.previewSeed) return;
      window.nappPreviewSeed(next.previewSeed);
    }
    document.documentElement.style.setProperty("--host-top", `${next.headerHeight}px`);
    setAppearance(next.preferences.appearance);
    setAxes(next.preferences.axes);
    setWritingPreferences(next.preferences.writing);
    setOpening((prev) => ({ ...prev, ...next }));
  };
  window.nappUpdate = adopt;
  window.nappOpen = (next) => {
    if (next) adopt(next);
    else setOpening((prev) => ({ ...prev, noteId: null }));
  };
  /* Once `nappOpen` exists, the app may lend the page to a note. */
  useEffect(() => post({ kind: "page" }), []);
  const { session, noteId, name, canEdit, preferences } = opening;
  /* Keyed by the note: leaving one unmounts it, which parks its document in
     collab.ts with no awareness, so a note put down is never a note one is in. */
  return noteId ? (
    <HostedNote
      key={noteId}
      ref={editor}
      onOpenNote={(target) => post({ kind: "link", noteId, target })}
      onOpenLink={() => post({ kind: "linkPrompt", noteId })}
      onOpenComment={(threadId) => post({ kind: "commentOpen", noteId, threadId })}
      session={session}
      noteId={noteId}
      name={name}
      canEdit={canEdit}
      autocorrectOn={preferences.autocorrect}
      collaboratorsVisible={preferences.collaborators}
      onState={(state) => post({ ...state, noteId })}
    />
  ) : null;
}
document.documentElement.style.setProperty("--host-top", `${window.napp.headerHeight}px`);
setAppearance(window.napp.preferences.appearance);
setAxes(window.napp.preferences.axes);
setWritingPreferences(window.napp.preferences.writing);
/* The phone's writing bar stands on the keyboard, and WebKit keeps the caret
   clear of the keyboard only. So the line being written is kept above the bar
   too. In a WKWebView the caret's rectangle is measured from the top of the
   web view, and the visual viewport's height is what the keyboard left; the
   check waits for WebKit's own scroll to the caret, which comes after the
   selection has changed. */
const BAR_CLEARANCE = 72;
let caretCheck = 0;
document.addEventListener("selectionchange", () => {
  window.clearTimeout(caretCheck);
  caretCheck = window.setTimeout(() => {
    const selection = document.getSelection();
    const viewport = window.visualViewport;
    /* No keyboard, nothing to clear. */
    if (!selection?.rangeCount || !viewport || viewport.height > window.innerHeight - 150) return;
    const caret = selection.getRangeAt(selection.rangeCount - 1).getBoundingClientRect();
    const limit = viewport.height - BAR_CLEARANCE;
    if (caret.height && caret.bottom > limit)
      window.scrollBy({ top: caret.bottom - limit, behavior: "smooth" });
  }, 320);
});
createRoot(document.getElementById("root")!).render(<Page />);
