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

/* The picture the app's viewer is showing, and the place it came out of. It
   is hidden from the note once the viewer has drawn its copy over it, so the
   picture is seen to leave rather than to be duplicated, and it comes back
   when the copy has flown home. */
let shown: HTMLImageElement | null = null;
async function openImage(noteId: string, image: HTMLImageElement, src: string, alt: string) {
  const blob = await (await fetch(src)).blob();
  const uri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  /* Where the picture itself is drawn: `object-fit: contain` leaves bands in
     the element's box when the picture is taller than the cap. */
  const box = image.getBoundingClientRect();
  const width = image.naturalWidth || box.width;
  const height = image.naturalHeight || box.height;
  const scale = Math.min(box.width / width, box.height / height);
  shown?.style.removeProperty("visibility");
  shown = image;
  post({
    kind: "image",
    noteId,
    uri,
    alt,
    width,
    height,
    editable: image.closest(".rich-media-image")?.querySelector(".rich-media-remove") !== null,
    rect: {
      x: box.left + (box.width - width * scale) / 2,
      y: box.top + (box.height - height * scale) / 2,
      width: width * scale,
      height: height * scale,
    },
  });
}
function imageCommand(action: "shown" | "closed" | "markup" | "remove") {
  const image = shown;
  if (!image) return;
  if (action === "shown") image.style.visibility = "hidden";
  else image.style.removeProperty("visibility");
  if (action === "closed" || action === "shown") {
    if (action === "closed") shown = null;
    return;
  }
  shown = null;
  const frame = image.closest(".rich-media-image");
  frame
    ?.querySelector<HTMLButtonElement>(
      action === "markup" ? ".rich-media-remove.is-ink" : ".rich-media-remove:not(.is-ink)",
    )
    ?.click();
}

/* The current match of Find in Note, brought to the middle of what the
   keyboard and the find bar leave of the page. The page cannot see the
   app's keyboard, so the bottom of that space is the share of the screen a
   phone keyboard and the bar above it leave. */
/* The current match is the one being read: Notes and Safari draw it solid
   yellow under dark ink, the others only tinted. */
const findStyle = document.createElement("style");
findStyle.textContent =
  ".rich-text-content .find-and-replace-result-current{background:var(--tint-yellow);color:#1c1c1e;box-shadow:0 0 0 2px var(--tint-yellow)}";
document.head.appendChild(findStyle);
function centreMatch() {
  const match = document.querySelector(".find-and-replace-result-current");
  if (!match) return;
  const box = match.getBoundingClientRect();
  const top =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--host-top")) || 0;
  // ponytail: estimated keyboard edge; pass the real one in the command if it ever misses.
  const bottom = window.innerHeight * 0.55;
  let scroller = match.parentElement;
  while (
    scroller &&
    !(
      scroller.scrollHeight > scroller.clientHeight &&
      /(auto|scroll)/.test(getComputedStyle(scroller).overflowY)
    )
  )
    scroller = scroller.parentElement;
  (scroller ?? document.scrollingElement ?? document.documentElement).scrollBy({
    top: box.top + box.height / 2 - (top + bottom) / 2,
    behavior: "smooth",
  });
}

function Page() {
  const [opening, setOpening] = useState(window.napp);
  const editor = useRef<HostedController>(null);
  window.nappCommand = (id, command) => {
    const execute = async () => {
      if (command.type === "image") return imageCommand(command.action);
      if (!editor.current) throw new Error("The note is still loading");
      const value = await editor.current.execute(command);
      if (["search", "nextMatch", "previousMatch"].includes(command.type))
        requestAnimationFrame(centreMatch);
      return value;
    };
    void execute().then(
      (value) => post({ kind: "result", id, value: value ?? null }),
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
      onOpenImage={(image, src, alt) => void openImage(noteId, image, src, alt).catch(() => {})}
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
/* As in Notes: pulling the page down while writing puts the keyboard away.
   The words scroll inside the page's own box, so the web view's scroll view
   never sees the drag and its own dismiss mode cannot answer it; the page
   watches the finger instead. A drag that has travelled down far enough,
   with the keyboard up, is the reader done writing for now. */
let dragFrom: number | null = null;
document.addEventListener(
  "touchstart",
  (event) => {
    dragFrom = event.touches.length === 1 ? event.touches[0]!.clientY : null;
  },
  { passive: true },
);
document.addEventListener(
  "touchmove",
  (event) => {
    const viewport = window.visualViewport;
    if (dragFrom === null || !viewport || viewport.height > window.innerHeight - 150) return;
    if (event.touches[0]!.clientY - dragFrom > 48) {
      dragFrom = null;
      (document.activeElement as HTMLElement | null)?.blur();
    }
  },
  { passive: true },
);
document.addEventListener("touchend", () => (dragFrom = null), { passive: true });
createRoot(document.getElementById("root")!).render(<Page />);
