import { useHeaderHeight } from "expo-router/react-navigation";
import { useToolbarIcon } from "../../icons";
/* One note, open. The words are the core's editor in a WebView — the page in
 * editor/ — and the bar over it is the system's, in glass, with the note's
 * menu in it.
 *
 * The page is loaded as a string with `https://notes` as its base URL: that is
 * the Origin the collaboration server accepts, where an HTML string loaded any
 * other way sends `null` and is refused. What crosses into it is which note,
 * as whom, and the access token, set before its script runs; a refreshed token
 * follows it in. The refresh token never crosses — see editor/main.tsx. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StyleSheet, Text } from "react-native";
import { WebView } from "react-native-webview";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { HostedNoteState } from "@notes-app/core/hosted";
import { indexOf } from "@/lib/derived";
import { fileNote, lockNote, pinNote, restoreNote, shelveNote, trashNote } from "@/lib/noteActs";
import { supabase } from "@/lib/supabaseClient";
import { deleteNotes } from "@/lib/supabase";
import { attempt } from "../../SettingsControls";
import { useArchive, usePalette } from "../../archive";

/* Built by `pnpm editor` before Metro runs; read once per launch. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PAGE: number = require("../../../editor/dist/index.html");
let page: Promise<string> | null = null;
const pageHtml = () =>
  (page ??= Asset.fromModule(PAGE)
    .downloadAsync()
    .then((asset) => new File(asset.localUri!).text()));

export default function Note() {
  const icon = useToolbarIcon();
  const headerHeight = useHeaderHeight();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, snapshot, metaOf, act, preferences, setOpenNote, refresh } = useArchive();
  const palette = usePalette();
  const router = useRouter();
  const [html, setHtml] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);
  const [pageError, setPageError] = useState("");
  const [state, setState] = useState<HostedNoteState | null>(null);
  /* `WebView<object>`: the library's default type argument is `undefined`,
     and its props intersected with `undefined` are `never`. */
  const web = useRef<WebView<object>>(null);

  const entry = snapshot?.entries.find((candidate) => candidate.note.id === id);
  const owner = entry?.note.ownerId ?? session.userId;
  const row = indexOf(metaOf(owner)).byNote.get(id);
  const self = snapshot?.members.find((member) => member.isSelf);
  const name = self?.nickname || session.email.split("@")[0] || "Someone";
  const foreignLock = Boolean(row?.lockedBy && row.lockedBy !== session.userId);
  const canEdit =
    Boolean(entry) && !row?.trashedAt && (!row?.lockedBy || row.lockedBy === session.userId);

  useEffect(() => {
    void pageHtml().then(setHtml, (reason) => setPageError(String(reason)));
    void supabase.auth.getSession().then(
      ({ data }) => setAccessToken(data.session?.access_token ?? null),
      (reason) => setPageError(String(reason)),
    );
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "TOKEN_REFRESHED" && next)
        web.current?.injectJavaScript(
          `window.nappToken(${JSON.stringify(next.access_token)});true;`,
        );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /* Seed once per note; later permissions and preferences use nappUpdate so
     the hosted page keeps its editor and its Y.Doc. */
  const opening = useMemo(
    () =>
      accessToken === undefined
        ? null
        : `window.napp = ${JSON.stringify({ session, noteId: id, name, canEdit, accessToken, preferences, headerHeight }).replace(/</g, "\\u003c")};true;`,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accessToken, id],
  );

  /* Inline the opening before the page's module script. Android does not
     guarantee that injectedJavaScriptBeforeContentLoaded runs before it. */
  const source = useMemo(
    () =>
      html && opening
        ? {
            html: html.replace("<head>", `<head><script>${opening}</script>`),
            baseUrl: "https://notes",
          }
        : null,
    [html, opening],
  );

  useEffect(() => {
    setOpenNote(id);
    return () => setOpenNote(null);
  }, [id, setOpenNote]);
  const updatePage = useCallback(
    () =>
      web.current?.injectJavaScript(
        `window.nappUpdate?.(${JSON.stringify({ canEdit, name, preferences, headerHeight })});true;`,
      ),
    [canEdit, name, preferences, headerHeight],
  );
  useEffect(() => {
    updatePage();
  }, [updatePage]);

  const status = !state
    ? ""
    : state.refusal ||
      (state.connection === "offline"
        ? "Offline"
        : state.ready
          ? ""
          : state.waking
            ? "Waking the server"
            : "Connecting");

  const leave = (change: Parameters<typeof act>[1]) => {
    act(owner, change);
    router.back();
  };

  return (
    <>
      <Stack.Screen options={{ title: status, headerLargeTitle: false }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon={icon("ellipsis")}>
          {!row?.trashedAt ? (
            <>
              <Stack.Toolbar.MenuAction
                disabled={foreignLock}
                icon={icon(row?.pinned ? "pin.slash" : "pin")}
                onPress={() => act(owner, (prev) => pinNote(prev, id))}
              >
                {row?.pinned ? "Unpin" : "Pin"}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon={icon(row?.lockedBy === session.userId ? "lock.open" : "lock")}
                disabled={Boolean(row?.lockedBy && row.lockedBy !== session.userId)}
                onPress={() => act(owner, (prev) => lockNote(prev, id, session.userId))}
              >
                {row?.lockedBy === session.userId ? "Unlock" : "Lock"}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.Menu icon={icon("folder")}>
                <Stack.Toolbar.Label>Move</Stack.Toolbar.Label>
                <Stack.Toolbar.MenuAction
                  disabled={foreignLock}
                  onPress={() => act(owner, (prev) => fileNote(prev, id, null))}
                >
                  No Folder
                </Stack.Toolbar.MenuAction>
                {metaOf(owner).folders.map((folder) => (
                  <Stack.Toolbar.MenuAction
                    key={folder.id}
                    disabled={foreignLock}
                    onPress={() => act(owner, (prev) => fileNote(prev, id, folder.id))}
                  >
                    {folder.name}
                  </Stack.Toolbar.MenuAction>
                ))}
              </Stack.Toolbar.Menu>
              <Stack.Toolbar.MenuAction
                disabled={foreignLock}
                icon={icon("archivebox")}
                onPress={() => leave((prev) => shelveNote(prev, id, !row?.archivedAt))}
              >
                {row?.archivedAt ? "Put back" : "Archive"}
              </Stack.Toolbar.MenuAction>
            </>
          ) : (
            <Stack.Toolbar.MenuAction
              icon={icon("arrow.uturn.backward")}
              disabled={foreignLock}
              onPress={() => leave((prev) => restoreNote(prev, id))}
            >
              Restore
            </Stack.Toolbar.MenuAction>
          )}
          <Stack.Toolbar.MenuAction
            disabled={foreignLock}
            icon={icon("trash")}
            destructive
            onPress={() =>
              row?.trashedAt
                ? Alert.alert("Delete Forever?", "This note will be permanently deleted.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete Forever",
                      style: "destructive",
                      onPress: () =>
                        void attempt(async () => {
                          await deleteNotes(session, [id]);
                          refresh();
                          router.back();
                        }),
                    },
                  ])
                : leave((prev) => trashNote(prev, id))
            }
          >
            {row?.trashedAt ? "Delete Forever" : "Delete"}
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
      {pageError ? <Text style={{ color: palette.danger, margin: 24 }}>{pageError}</Text> : null}
      {source ? (
        <WebView<object>
          ref={web}
          key={id}
          onLoadEnd={updatePage}
          onError={(event) => setPageError(event.nativeEvent.description)}
          style={[styles.page, { backgroundColor: palette.page }]}
          source={source}
          originWhitelist={["*"]}
          onMessage={(event) => {
            try {
              const next = JSON.parse(event.nativeEvent.data) as HostedNoteState;
              if (typeof next.ready === "boolean" && typeof next.connection === "string")
                setState(next);
            } catch {
              /* Only status messages cross this bridge. */
            }
          }}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
