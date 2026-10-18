/* One editor page for the whole session, lent to whichever note is in front.
 *
 * A WKWebView is a process of its own: every note that built one waited about
 * a second for WebKit to start it before a byte of the page was read, and then
 * opened its own socket, its own auth and its own sync. So there is one page,
 * loaded once the archive is open, and the note on screen borrows it — the
 * native view is carried into the note's screen by `react-native-teleport`,
 * not rebuilt, and the page is told which note to show. The page keeps the
 * session's one socket and the core's parked documents (`collab.ts`), so going
 * back to a note is its mount and nothing else.
 *
 * The page answers one note at a time, so the screen in front has it: a note
 * opened from a link in another takes it, and gives it back on the way out.
 * Between notes the page shows nothing — never the last note — so a borrower
 * cannot be shown somebody else's words for a frame.
 *
 * What crosses in is which note, as whom, and an access token; the refresh
 * token never crosses — see editor/main.tsx. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Linking, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { Portal, PortalHost, PortalProvider } from "react-native-teleport";
import { useFocusEffect } from "expo-router";
import { Asset } from "expo-asset";
import { File, Directory, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { randomUUID } from "expo-crypto";
import type { HostedNoteState } from "@notes-app/core/hosted";
import { supabase } from "@/lib/supabaseClient";
import { HostedRequests } from "@/lib/hostedRequests";
import type { HostedCommand } from "@/lib/hostedCommands";
import type { AccountPreferences } from "@/lib/accountPreferences";
import type { Note as StoredNote } from "@/lib/types";
import { useArchive, usePalette } from "./archive";

/* Built by `pnpm editor` before Metro runs; read once per launch. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PAGE: number = require("../editor/dist/index.html");
let page: Promise<string> | null = null;
const pageHtml = () =>
  (page ??= Asset.fromModule(PAGE)
    .downloadAsync()
    .then((asset) => new File(asset.localUri!).text()));

/* Builds before the page answered getSession itself kept a session in the
   page's own storage, with a stand-in refresh token that can only fail. Left
   there, auth-js would recover it on load, try that refresh, and sign the page
   out from under the first note. The page persists nothing of its own now. */
const FORGET_PAGE_AUTH =
  "try{Object.keys(localStorage).filter(function(k){return k.indexOf('sb-')===0}).forEach(function(k){localStorage.removeItem(k)})}catch(e){}";

const literal = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

/** What the note in front says about itself; the page's own `Opening` less
 *  the session and the token, which are the page's from its load. */
export interface NoteOpening {
  noteId: string;
  name: string;
  canEdit: boolean;
  preferences: AccountPreferences;
  headerHeight: number;
  /** Preview stores live in separate JS processes; production reads the server. */
  previewSeed?: StoredNote;
}

export interface NoteHandlers {
  onState: (state: HostedNoteState) => void;
  onLink: (noteId: string) => void;
  onLinkPrompt: () => void;
  onComment: (threadId: string) => void;
}

interface Borrower {
  key: string;
  opening: NoteOpening;
  handlers: NoteHandlers;
}

interface Shared {
  borrow: (borrower: Borrower) => void;
  update: (key: string, opening: NoteOpening) => void;
  giveBack: (key: string) => void;
  execute: <T>(key: string, command: HostedCommand) => Promise<T>;
  holder: string | null;
}

const Context = createContext<Shared | null>(null);

export function HostedPageProvider({ children }: { children: ReactNode }) {
  const { session, preferences } = useArchive();
  const palette = usePalette();
  const web = useRef<WebView<object>>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [token, setToken] = useState<string | null | undefined>(undefined);
  /** The page has run its script and answers `nappOpen`. */
  const loaded = useRef(false);
  const borrower = useRef<Borrower | null>(null);
  const [holder, setHolder] = useState<string | null>(null);
  const waiting = useRef(new HostedRequests());
  /* The first preferences, for the page's first paint; later ones travel with
     each opening. */
  const [firstPreferences] = useState(() => ({
    ...preferences,
    appearance: { ...preferences.appearance, background: palette.canvas, foreground: palette.ink },
  }));

  useEffect(() => {
    void pageHtml().then(setHtml, (reason) => console.error("The note page did not load", reason));
    void supabase.auth.getSession().then(
      ({ data }) => setToken(data.session?.access_token ?? null),
      () => setToken(null),
    );
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "TOKEN_REFRESHED" && next)
        web.current?.injectJavaScript(`window.nappToken(${literal(next.access_token)});true;`);
    });
    /* Back from the background, the page's one socket may be a corpse that
       never closes — the phone's version of the wake path in Notes.tsx. */
    let away = false;
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "background") away = true;
      else if (state === "active" && away) {
        away = false;
        web.current?.injectJavaScript("window.nappWake?.();true;");
      }
    });
    return () => {
      data.subscription.unsubscribe();
      listener.remove();
    };
  }, []);

  const inject = (script: string) => web.current?.injectJavaScript(`${script};true;`);
  const open = useCallback((opening: NoteOpening | null) => {
    if (loaded.current) inject(`window.nappOpen(${literal(opening)})`);
  }, []);

  const source = useMemo(() => {
    if (!html || token === undefined) return null;
    const napp = {
      session,
      noteId: null,
      name: "",
      canEdit: false,
      accessToken: token,
      preferences: firstPreferences,
      headerHeight: 0,
    };
    /* Inlined before the page's module script: Android does not promise that
       injectedJavaScriptBeforeContentLoaded runs first. */
    return {
      html: html.replace(
        "<head>",
        `<head><script>${FORGET_PAGE_AUTH}window.napp=${literal(napp)};</script>`,
      ),
      baseUrl: "https://notes",
    };
  }, [html, token, session, firstPreferences]);

  /* Stable, so a borrower's focus effect does not hand the page back and take
     it again whenever who holds it changes. */
  const acts = useMemo<Omit<Shared, "holder">>(
    () => ({
      borrow: (next) => {
        if (borrower.current?.key !== next.key)
          waiting.current.reset("The note was closed or reloaded");
        borrower.current = next;
        setHolder(next.key);
        open(next.opening);
      },
      update: (key, opening) => {
        if (borrower.current?.key !== key) return;
        borrower.current = { ...borrower.current, opening };
        if (loaded.current) inject(`window.nappUpdate(${literal(opening)})`);
      },
      giveBack: (key) => {
        if (borrower.current?.key !== key) return;
        borrower.current = null;
        waiting.current.reset("The note was closed");
        setHolder(null);
        open(null);
      },
      execute: <T,>(key: string, command: HostedCommand) => {
        if (borrower.current?.key !== key || !loaded.current)
          return Promise.reject(new Error("The note is still loading"));
        const id = randomUUID();
        return waiting.current.request<T>(
          id,
          () => inject(`window.nappCommand?.(${literal(id)}, ${literal(command)})`),
          240000,
        );
      },
    }),
    [open],
  );
  const shared = useMemo<Shared>(() => ({ ...acts, holder }), [acts, holder]);

  const onMessage = async (event: WebViewMessageEvent) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.kind === "token") {
      /* The page's token is about to lapse: this client is the one that may
         refresh, and getSession does so when it has to. */
      const { data } = await supabase.auth.getSession();
      if (data.session) inject(`window.nappToken(${literal(data.session.access_token)})`);
      return;
    }
    if (message.kind === "page") {
      loaded.current = true;
      open(borrower.current?.opening ?? null);
      return;
    }
    const current = borrower.current;
    if (message.kind === "result" && typeof message.id === "string") {
      waiting.current.settle(
        message.id,
        message.value,
        typeof message.error === "string" ? message.error : undefined,
      );
    } else if (message.kind === "file" && typeof message.id === "string") {
      let error: string | undefined;
      try {
        if (
          typeof message.name !== "string" ||
          typeof message.base64 !== "string" ||
          !["open", "save"].includes(String(message.operation))
        )
          throw new Error("Invalid file request");
        const directory = new Directory(Paths.cache, `export-${randomUUID()}`);
        directory.create();
        const file = new File(directory, message.name.replace(/[/\\]/g, "-") || "Note");
        file.create();
        await file.write(message.base64, { encoding: "base64" });
        const options = { mimeType: typeof message.mime === "string" ? message.mime : undefined };
        const preview = message.operation === "open" && (await file.canPreview(options));
        if (preview) await file.preview(options);
        else await shareAsync(file.uri, options);
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
      }
      inject(`window.nappFileResult?.(${literal(message.id)},${literal(error ?? null)})`);
    } else if (!current || message.noteId !== current.opening.noteId) {
      /* A word from a note that has since been put down. */
    } else if (message.kind === "commentOpen" && typeof message.threadId === "string") {
      current.handlers.onComment(message.threadId);
    } else if (message.kind === "linkPrompt") {
      current.handlers.onLinkPrompt();
    } else if (message.kind === "link" && typeof message.target === "string") {
      current.handlers.onLink(message.target);
    } else if (typeof message.ready === "boolean" && typeof message.connection === "string") {
      current.handlers.onState(message as unknown as HostedNoteState);
    }
  };

  return (
    <Context.Provider value={shared}>
      <PortalProvider>
        {children}
        {/* Parked off to the side while no note holds it: alive, out of sight. */}
        <View style={styles.parked} pointerEvents="none">
          <Portal hostName={holder ?? undefined}>
            {source ? (
              <WebView<object>
                ref={web}
                style={{ flex: 1, backgroundColor: palette.canvas }}
                containerStyle={{ flex: 1 }}
                source={source}
                originWhitelist={["*"]}
                onLoadStart={() => {
                  loaded.current = false;
                }}
                onMessage={(event) => void onMessage(event)}
                /* iOS may take the page's process back under memory pressure;
                   a page that is gone is loaded again, and its note reopened. */
                onContentProcessDidTerminate={() => web.current?.reload()}
                onShouldStartLoadWithRequest={(request) => {
                  if (
                    request.url === "about:blank" ||
                    request.url === "https://notes/" ||
                    request.url === "https://notes" ||
                    request.url.startsWith("data:text/html")
                  )
                    return true;
                  if (/^(https?:|mailto:|tel:)/i.test(request.url))
                    void Linking.openURL(request.url).catch(() => {});
                  return false;
                }}
                contentInsetAdjustmentBehavior="never"
                automaticallyAdjustContentInsets={false}
                keyboardDisplayRequiresUserAction={false}
                hideKeyboardAccessoryView
                webviewDebuggingEnabled={__DEV__}
              />
            ) : null}
          </Portal>
        </View>
      </PortalProvider>
    </Context.Provider>
  );
}

/** Borrows the page for one note while its screen is in front. `Host` is
 *  where the page is drawn; `execute` asks the editor something. */
export function useHostedNote(opening: NoteOpening, handlers: NoteHandlers) {
  const palette = usePalette();
  const resolvedPreferences = useMemo(
    () => ({
      ...opening.preferences,
      appearance: {
        ...opening.preferences.appearance,
        background: palette.canvas,
        foreground: palette.ink,
      },
    }),
    [opening.preferences, palette.canvas, palette.ink],
  );
  const resolvedOpening = { ...opening, preferences: resolvedPreferences };
  const shared = useContext(Context);
  if (!shared) throw new Error("useHostedNote() outside a HostedPageProvider");
  const [key] = useState(() => `note-${randomUUID()}`);
  const latest = useRef({ opening: resolvedOpening, handlers });
  latest.current = { opening: resolvedOpening, handlers };
  const { borrow, giveBack, update } = shared;

  /* Taken on focus, so a note returned to from a note it linked to takes the
     page back; given back only when the screen goes, so a note being swiped
     away keeps its words until it is off the screen. */
  useEffect(() => () => giveBack(key), [giveBack, key]);
  useFocusEffect(
    useCallback(() => {
      borrow({
        key,
        opening: latest.current.opening,
        handlers: {
          onState: (state) => latest.current.handlers.onState(state),
          onLink: (id) => latest.current.handlers.onLink(id),
          onLinkPrompt: () => latest.current.handlers.onLinkPrompt(),
          onComment: (id) => latest.current.handlers.onComment(id),
        },
      });
    }, [borrow, key]),
  );
  const { noteId, name, canEdit, preferences, headerHeight, previewSeed } = resolvedOpening;
  useEffect(() => {
    update(key, { noteId, name, canEdit, preferences, headerHeight, previewSeed });
  }, [update, key, noteId, name, canEdit, preferences, headerHeight, previewSeed]);

  const run = shared.execute;
  const execute = useCallback(
    <T = unknown,>(command: HostedCommand) => run<T>(key, command),
    [run, key],
  );
  const Host = useCallback(
    ({ style }: { style?: StyleProp<ViewStyle> }) => <PortalHost name={key} style={style} />,
    [key],
  );
  return { execute, Host, holding: shared.holder === key };
}

const styles = StyleSheet.create({
  parked: { position: "absolute", left: -10000, top: 0, width: 400, height: 800 },
});
