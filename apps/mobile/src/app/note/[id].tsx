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
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Linking, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Asset } from "expo-asset";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import type { HostedNoteState } from "@notes-app/core/hosted";
import { indexOf } from "@/lib/derived";
import { fileNote, lockNote, pinNote, restoreNote, shelveNote, trashNote } from "@/lib/noteActs";
import { supabase } from "@/lib/supabaseClient";
import { deleteNotes, uploadObjectBytes } from "@/lib/supabase";
import {
  assertAttachable,
  attachmentLabel,
  attachmentType,
  MAX_ATTACHMENT_BYTES,
} from "@/features/editor/lib/attachments";
import type { HostedCommand } from "@/lib/hostedCommands";
import type { SearchStatus } from "@/features/editor/components/RichTextEditor";
import { NoteHistory } from "../../NoteHistory";
import { NoteComments } from "../../NoteComments";
import { useHostedEditor } from "../../useHostedEditor";
import { useTextPrompt } from "../../TextPrompt";
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
  const nativeHeaderHeight = useHeaderHeight();
  const [finding, setFinding] = useState(false);
  const headerHeight = nativeHeaderHeight + (finding ? 56 : 0);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchStatus>({ current: 0, total: 0 });
  const [panel, setPanel] = useState<"history" | "comments" | null>(null);
  const [anchor, setAnchor] = useState<{ threadId: string; quote: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const prompt = useTextPrompt();
  const { id, comments: openComments } = useLocalSearchParams<{ id: string; comments?: string }>();
  useEffect(() => {
    if (openComments === "1") setPanel("comments");
  }, [openComments]);
  const { session, snapshot, metaOf, act, preferences, setOpenNote, refresh } = useArchive();
  const palette = usePalette();
  const router = useRouter();
  const [html, setHtml] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);
  const [pageError, setPageError] = useState("");
  const [state, setState] = useState<HostedNoteState | null>(null);
  const askLink = () =>
    prompt(
      "Insert Link",
      undefined,
      (url) =>
        void attempt(async () => {
          if (!/^(https?:|mailto:)/i.test(url.trim()))
            throw new Error("Enter an https, http or mailto link");
          await execute({ type: "link", url: url.trim() });
        }),
      "plain-text",
      "https://",
      "url",
    );
  const { web, execute, onMessage, onLoadStart } = useHostedEditor(
    id,
    setState,
    (noteId) => router.push({ pathname: "/note/[id]", params: { id: noteId } }),
    askLink,
    () => {
      setAnchor(null);
      setPanel("comments");
    },
  );

  const entry = snapshot?.entries.find((candidate) => candidate.note.id === id);
  const owner = entry?.note.ownerId ?? session.userId;
  const row = indexOf(metaOf(owner)).byNote.get(id);
  const self = snapshot?.members.find((member) => member.isSelf);
  const name = self?.nickname || session.email.split("@")[0] || "Someone";
  const foreignLock = Boolean(row?.lockedBy && row.lockedBy !== session.userId);
  const canEdit =
    Boolean(entry) &&
    self?.role === "editor" &&
    !row?.trashedAt &&
    (!row?.lockedBy || row.lockedBy === session.userId);

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
  }, [web]);

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

  useFocusEffect(
    useCallback(() => {
      setOpenNote(id);
      return () => setOpenNote(null);
    }, [id, setOpenNote]),
  );
  const updatePage = useCallback(
    () =>
      web.current?.injectJavaScript(
        `window.nappUpdate?.(${JSON.stringify({ canEdit, name, preferences, headerHeight })});true;`,
      ),
    [canEdit, name, preferences, headerHeight, web],
  );
  useEffect(() => {
    updatePage();
  }, [updatePage]);

  useEffect(() => {
    if (!finding) return;
    let live = true;
    const timer = setTimeout(
      () =>
        void execute<SearchStatus>({ type: "search", query }).then(
          (result) => {
            if (live) setMatches(result);
          },
          () => {},
        ),
      160,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [execute, finding, query]);

  const run = (command: HostedCommand) =>
    void attempt(async () => {
      setBusy(true);
      try {
        await execute(command);
      } finally {
        setBusy(false);
      }
    });
  const attach = (image: boolean) =>
    void attempt(async () => {
      if (!canEdit || busy) return;
      const picked = await File.pickFileAsync({
        mimeTypes: image
          ? ["image/jpeg", "image/png", "image/webp", "image/gif"]
          : ["application/pdf", "video/mp4", "video/webm", "video/quicktime"],
      });
      if (picked.canceled) return;
      const file = picked.result;
      if (image) {
        if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Images must be smaller than 100 MB");
      } else assertAttachable(file);
      setBusy(true);
      try {
        const objectId = randomUUID();
        await uploadObjectBytes(
          session,
          objectId,
          await file.arrayBuffer(),
          image ? file.type : attachmentType(file.name),
        );
        await execute({ type: "attach", objectId, label: attachmentLabel(file.name), image });
      } finally {
        setBusy(false);
      }
    });
  const comments = () =>
    void attempt(async () => {
      const selected =
        canEdit && state?.available
          ? await execute<{ threadId: string; quote: string } | null>({
              type: "comment",
              threadId: randomUUID(),
            })
          : null;
      setAnchor(selected);
      setPanel("comments");
    });
  const formatActions = [
    ["body", "Body"],
    ["heading-1", "Heading"],
    ["heading-2", "Subheading"],
    ["bold", "Bold"],
    ["italic", "Italic"],
    ["strike", "Strikethrough"],
    ["code", "Code"],
    ["checklist", "Checklist"],
    ["bullet-list", "Bulleted List"],
    ["ordered-list", "Numbered List"],
    ["quote", "Quote"],
    ["divider", "Divider"],
    ["table-3", "Table"],
    ["drawing", "Drawing"],
    ["drawing-page", "Drawing Page"],
  ] as const;

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
          <Stack.Toolbar.Menu icon={icon("textformat")}>
            <Stack.Toolbar.Label>Format</Stack.Toolbar.Label>
            {formatActions.map(([action, label]) => (
              <Stack.Toolbar.MenuAction
                key={action}
                disabled={!canEdit || busy}
                onPress={() => run({ type: "format", action })}
              >
                {label}
              </Stack.Toolbar.MenuAction>
            ))}
            <Stack.Toolbar.MenuAction disabled={!canEdit || busy} onPress={askLink}>
              Insert Link
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.Menu icon={icon("square.and.arrow.up")}>
            <Stack.Toolbar.Label>Share as</Stack.Toolbar.Label>
            {(["md", "pdf", "docx"] as const).map((format) => (
              <Stack.Toolbar.MenuAction
                key={format}
                disabled={busy}
                onPress={() => run({ type: "export", format })}
              >
                {format === "md" ? "Markdown" : format === "pdf" ? "PDF" : "Word"}
              </Stack.Toolbar.MenuAction>
            ))}
          </Stack.Toolbar.Menu>
          <Stack.Toolbar.MenuAction icon={icon("clock")} onPress={() => setPanel("history")}>
            History
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon={icon("bubble.left.and.bubble.right")} onPress={comments}>
            Comments
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon={icon("magnifyingglass")} onPress={() => setFinding(true)}>
            Find in Note
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={icon("photo")}
            disabled={!canEdit || busy}
            onPress={() => attach(true)}
          >
            Insert Image
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon={icon("paperclip")}
            disabled={!canEdit || busy}
            onPress={() => attach(false)}
          >
            Attach File
          </Stack.Toolbar.MenuAction>
          {!row?.trashedAt ? (
            <>
              <Stack.Toolbar.MenuAction
                disabled={foreignLock || self?.role !== "editor"}
                icon={icon(row?.pinned ? "pin.slash" : "pin")}
                onPress={() => act(owner, (prev) => pinNote(prev, id))}
              >
                {row?.pinned ? "Unpin" : "Pin"}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction
                icon={icon(row?.lockedBy === session.userId ? "lock.open" : "lock")}
                disabled={
                  self?.role !== "editor" ||
                  Boolean(row?.lockedBy && row.lockedBy !== session.userId)
                }
                onPress={() => act(owner, (prev) => lockNote(prev, id, session.userId))}
              >
                {row?.lockedBy === session.userId ? "Unlock" : "Lock"}
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.Menu icon={icon("folder")}>
                <Stack.Toolbar.Label>Move</Stack.Toolbar.Label>
                <Stack.Toolbar.MenuAction
                  disabled={foreignLock || self?.role !== "editor"}
                  onPress={() => act(owner, (prev) => fileNote(prev, id, null))}
                >
                  No Folder
                </Stack.Toolbar.MenuAction>
                {metaOf(owner).folders.map((folder) => (
                  <Stack.Toolbar.MenuAction
                    key={folder.id}
                    disabled={foreignLock || self?.role !== "editor"}
                    onPress={() => act(owner, (prev) => fileNote(prev, id, folder.id))}
                  >
                    {folder.name}
                  </Stack.Toolbar.MenuAction>
                ))}
              </Stack.Toolbar.Menu>
              <Stack.Toolbar.MenuAction
                disabled={foreignLock || self?.role !== "editor"}
                icon={icon("archivebox")}
                onPress={() => leave((prev) => shelveNote(prev, id, !row?.archivedAt))}
              >
                {row?.archivedAt ? "Put back" : "Archive"}
              </Stack.Toolbar.MenuAction>
            </>
          ) : (
            <Stack.Toolbar.MenuAction
              icon={icon("arrow.uturn.backward")}
              disabled={foreignLock || self?.role !== "editor"}
              onPress={() => leave((prev) => restoreNote(prev, id))}
            >
              Restore
            </Stack.Toolbar.MenuAction>
          )}
          <Stack.Toolbar.MenuAction
            disabled={foreignLock || self?.role !== "editor"}
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
      <Stack.Toolbar>
        <Stack.Toolbar.Button
          icon={icon("bold")}
          disabled={!canEdit || busy}
          onPress={() => run({ type: "format", action: "bold" })}
          accessibilityLabel="Bold"
        />
        <Stack.Toolbar.Button
          icon={icon("checklist")}
          disabled={!canEdit || busy}
          onPress={() => run({ type: "format", action: "checklist" })}
          accessibilityLabel="Checklist"
        />
        <Stack.Toolbar.Button
          icon={icon("tablecells")}
          disabled={!canEdit || busy}
          onPress={() => run({ type: "format", action: "table-3" })}
          accessibilityLabel="Table"
        />
        <Stack.Toolbar.Spacer />
        <Stack.Toolbar.Button
          icon={icon("paperclip")}
          disabled={!canEdit || busy}
          onPress={() => attach(false)}
          accessibilityLabel="Attach File"
        />
        <Stack.Toolbar.Button
          icon={icon("bubble.left.and.bubble.right")}
          onPress={comments}
          accessibilityLabel="Comments"
        />
      </Stack.Toolbar>
      {panel === "history" ? (
        <NoteHistory
          noteId={id}
          canEdit={canEdit}
          execute={execute}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === "comments" ? (
        <NoteComments
          noteId={id}
          canEdit={canEdit}
          execute={execute}
          anchor={anchor}
          onClose={() => {
            setPanel(null);
            setAnchor(null);
          }}
        />
      ) : null}
      {finding ? (
        <View
          style={{
            position: "absolute",
            zIndex: 1,
            top: nativeHeaderHeight,
            left: 0,
            right: 0,
            height: 56,
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            gap: 12,
            backgroundColor: palette.paper,
          }}
        >
          <TextInput
            accessibilityLabel="Find in Note"
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Find in Note"
            placeholderTextColor={palette.ink3}
            style={{ flex: 1, color: palette.ink, fontSize: 17 }}
          />
          <Text style={{ color: palette.ink3 }}>
            {matches.current}/{matches.total}
          </Text>
          <Pressable
            accessibilityLabel="Previous Match"
            onPress={() =>
              void attempt(async () =>
                setMatches(await execute<SearchStatus>({ type: "previousMatch" })),
              )
            }
          >
            <Text style={{ color: palette.accent, fontSize: 22 }}>↑</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Next Match"
            onPress={() =>
              void attempt(async () =>
                setMatches(await execute<SearchStatus>({ type: "nextMatch" })),
              )
            }
          >
            <Text style={{ color: palette.accent, fontSize: 22 }}>↓</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setFinding(false);
              run({ type: "closeSearch" });
            }}
          >
            <Text style={{ color: palette.accent }}>Done</Text>
          </Pressable>
        </View>
      ) : null}
      {pageError ? <Text style={{ color: palette.danger, margin: 24 }}>{pageError}</Text> : null}
      {source ? (
        <WebView<object>
          ref={web}
          key={id}
          onLoadStart={onLoadStart}
          onLoadEnd={updatePage}
          onError={(event) => setPageError(event.nativeEvent.description)}
          style={[styles.page, { backgroundColor: palette.page }]}
          source={source}
          originWhitelist={["*"]}
          onMessage={(event) => void onMessage(event)}
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
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
