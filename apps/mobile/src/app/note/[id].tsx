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
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from "react";
import {
  Alert,
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import type { HostedNoteState } from "@notes-app/core/hosted";
import { indexOf } from "@/lib/derived";
import { fileNote, lockNote, pinNote, restoreNote, shelveNote, trashNote } from "@/lib/noteActs";
import { deleteNotes, uploadObjectBytes } from "@/lib/supabase";
import {
  assertAttachable,
  attachmentLabel,
  attachmentType,
  MAX_ATTACHMENT_BYTES,
} from "@/features/editor/lib/attachments";
import type { HostedCommand } from "@/lib/hostedCommands";
import type { SearchStatus } from "@/features/editor/components/RichTextEditor";
import { IconButton } from "../../IconButton";
import { NoteHistory } from "../../NoteHistory";
import { NoteComments } from "../../NoteComments";
import { useHostedNote } from "../../HostedPage";
import { useTextPrompt } from "../../TextPrompt";
import { attempt } from "../../SettingsControls";
import { useArchive, usePalette } from "../../archive";
import { Avatar, Faces } from "../../Avatar";
import { NoteSheet } from "../../NoteSheet";
import { Group, Row } from "../../Grouped";
import { WritingBar } from "../../WritingBar";
import { Bone } from "../../Chrome";
import Animated, { FadeOut } from "react-native-reanimated";

export default function Note() {
  const icon = useToolbarIcon();
  const nativeHeaderHeight = useHeaderHeight();
  const [finding, setFinding] = useState(false);
  const headerHeight = nativeHeaderHeight + (finding ? 56 : 0);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<SearchStatus>({ current: 0, total: 0 });
  const [panel, setPanel] = useState<"history" | "comments" | "people" | null>(null);
  const [anchor, setAnchor] = useState<{ threadId: string; quote: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const prompt = useTextPrompt();
  const { id, comments: openComments } = useLocalSearchParams<{ id: string; comments?: string }>();
  useEffect(() => {
    if (openComments === "1") setPanel("comments");
  }, [openComments]);
  const { session, snapshot, metaOf, act, preferences, setOpenNote, refresh, facesOf } =
    useArchive();
  const faces = facesOf(id);
  const palette = usePalette();
  const router = useRouter();
  const [state, setState] = useState<HostedNoteState | null>(null);
  /* Writing is the keyboard being up, as in Notes: the bar rides on it, the
     header grows undo and Done, and Done is what puts it away. */
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const shown = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", () =>
      setKeyboard(true),
    );
    const hidden = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () =>
      setKeyboard(false),
    );
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  const frame = useRef<ComponentRef<typeof View>>(null);
  const [frameTop, setFrameTop] = useState(0);
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

  const { execute, Host } = useHostedNote(
    {
      noteId: id,
      name,
      canEdit,
      preferences,
      headerHeight,
      previewSeed: import.meta.env.NAPP_PREVIEW === "1" ? entry?.note : undefined,
    },
    {
      onState: (next) => {
        setState(next);
      },
      onLink: (noteId) => router.push({ pathname: "/note/[id]", params: { id: noteId } }),
      onLinkPrompt: askLink,
      onComment: () => {
        setAnchor(null);
        setPanel("comments");
      },
    },
  );

  useFocusEffect(
    useCallback(() => {
      setOpenNote(id);
      return () => setOpenNote(null);
    }, [id, setOpenNote]),
  );
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

  const writing = keyboard && canEdit && !panel && !finding;

  const leave = (change: Parameters<typeof act>[1]) => {
    act(owner, change);
    router.back();
  };

  return (
    <>
      {/* Who else has a hand in this note stands in the bar's middle, as the
          collaborators do in Notes; a status the reader must know takes it. */}
      <Stack.Screen
        options={{
          title: status,
          headerLargeTitle: false,
          contentStyle: { backgroundColor: palette.canvas },
          headerTitle:
            status || !faces.length
              ? undefined
              : () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="People in this note"
                    hitSlop={10}
                    onPress={() => setPanel("people")}
                    style={{ height: 36, alignItems: "center", justifyContent: "center" }}
                  >
                    <Faces faces={faces} size={30} ring={palette.canvas} />
                  </Pressable>
                ),
        }}
      />
      <Stack.Toolbar placement="right" tintColor={palette.ink}>
        <Stack.Toolbar.Button
          icon={icon("arrow.uturn.backward")}
          accessibilityLabel="Undo"
          hidden={!writing || !state?.format?.canUndo}
          separateBackground
          onPress={() => run({ type: "edit", action: "undo" })}
        />
        <Stack.Toolbar.Menu icon={icon("square.and.arrow.up")} hidden={!writing}>
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
            icon={icon("paperclip")}
            disabled={!canEdit || busy}
            onPress={() => attach(false)}
          >
            Attach File
          </Stack.Toolbar.MenuAction>
          {!row?.trashedAt ? (
            <Stack.Toolbar.MenuAction
              disabled={foreignLock || self?.role !== "editor"}
              icon={icon(row?.pinned ? "pin.slash" : "pin")}
              onPress={() => act(owner, (prev) => pinNote(prev, id))}
            >
              {row?.pinned ? "Unpin" : "Pin"}
            </Stack.Toolbar.MenuAction>
          ) : null}
          {!row?.trashedAt ? (
            <Stack.Toolbar.MenuAction
              icon={icon(row?.lockedBy === session.userId ? "lock.open" : "lock")}
              disabled={
                self?.role !== "editor" || Boolean(row?.lockedBy && row.lockedBy !== session.userId)
              }
              onPress={() => act(owner, (prev) => lockNote(prev, id, session.userId))}
            >
              {row?.lockedBy === session.userId ? "Unlock" : "Lock"}
            </Stack.Toolbar.MenuAction>
          ) : null}
          {!row?.trashedAt ? (
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
          ) : null}
          {!row?.trashedAt ? (
            <Stack.Toolbar.MenuAction
              disabled={foreignLock || self?.role !== "editor"}
              icon={icon("archivebox")}
              onPress={() => leave((prev) => shelveNote(prev, id, !row?.archivedAt))}
            >
              {row?.archivedAt ? "Put back" : "Archive"}
            </Stack.Toolbar.MenuAction>
          ) : null}
          {row?.trashedAt ? (
            <Stack.Toolbar.MenuAction
              icon={icon("arrow.uturn.backward")}
              disabled={foreignLock || self?.role !== "editor"}
              onPress={() => leave((prev) => restoreNote(prev, id))}
            >
              Restore
            </Stack.Toolbar.MenuAction>
          ) : null}
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
        <Stack.Toolbar.Button
          icon={icon("checkmark")}
          accessibilityLabel="Done"
          hidden={!writing}
          variant="prominent"
          tintColor={palette.accent}
          onPress={() => run({ type: "edit", action: "done" })}
        />
      </Stack.Toolbar>
      {/* At rest, Notes' own row; while writing it gives way to the bar on
          the keyboard. */}
      {!keyboard ? (
        <Stack.Toolbar tintColor={palette.ink}>
          <Stack.Toolbar.View>
            <IconButton
              icon="checklist"
              label="Checklist"
              disabled={!canEdit || busy}
              onPress={() => run({ type: "format", action: "checklist" })}
            />
          </Stack.Toolbar.View>
          <Stack.Toolbar.View>
            <IconButton
              icon="paperclip"
              label="Attach"
              disabled={!canEdit || busy}
              onPress={() => attach(true)}
            />
          </Stack.Toolbar.View>
          <Stack.Toolbar.View>
            <IconButton
              icon="pencil.tip.crop.circle"
              label="Markup"
              disabled={!canEdit || busy}
              onPress={() => run({ type: "format", action: "drawing-page" })}
            />
          </Stack.Toolbar.View>
          <Stack.Toolbar.Spacer />
          <Stack.Toolbar.View>
            <IconButton icon="bubble.left.and.bubble.right" label="Comments" onPress={comments} />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      ) : null}
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
      {panel === "people" ? (
        <NoteSheet title="People" onClose={() => setPanel(null)}>
          <Group>
            {faces.map((face, at) => (
              <Row
                key={face.userId}
                leading={<Avatar face={face} size={40} ring={palette.paper} />}
                label={face.name}
                note={face.online ? "In this note now" : "Has written here"}
                chevron={false}
                last={at === faces.length - 1}
              />
            ))}
          </Group>
        </NoteSheet>
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
            <Text style={{ color: palette.ink, fontSize: 22 }}>↑</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Next Match"
            onPress={() =>
              void attempt(async () =>
                setMatches(await execute<SearchStatus>({ type: "nextMatch" })),
              )
            }
          >
            <Text style={{ color: palette.ink, fontSize: 22 }}>↓</Text>
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
      <Host style={[styles.page, { backgroundColor: palette.canvas }]} />
      {/* Until the editor holds the note, the shape of a note in the page's
          own colour; it dissolves into the words as they arrive. */}
      {!state?.available && !state?.refusal ? <NoteSkeleton top={headerHeight} /> : null}
      <View
        ref={frame}
        pointerEvents="box-none"
        style={StyleSheet.absoluteFill}
        onLayout={() => frame.current?.measureInWindow((_x, y) => setFrameTop(y))}
      >
        {/* Mounted while the note can be written, so it hears the keyboard
            arrive; it shows itself only on top of it. */}
        {canEdit && !panel && !finding ? (
          <WritingBar
            format={
              state?.format ?? {
                marks: [],
                block: "body",
                list: null,
                selection: false,
                canUndo: false,
                canRedo: false,
              }
            }
            run={run}
            onLink={askLink}
            onAttach={attach}
            onComment={comments}
            frameTop={frameTop}
          />
        ) : null}
      </View>
    </>
  );
}

const LINES = ["92%", "100%", "86%", "97%", "64%", null, "100%", "90%", "95%", "48%"] as const;

function NoteSkeleton({ top }: { top: number }) {
  const palette = usePalette();
  return (
    <Animated.View
      exiting={FadeOut.duration(260)}
      pointerEvents="none"
      accessibilityLabel="Loading"
      style={[
        StyleSheet.absoluteFill,
        styles.skeleton,
        { paddingTop: top + 18, backgroundColor: palette.canvas },
      ]}
    >
      <Bone style={{ width: "58%", height: 30, borderRadius: 10, marginBottom: 26 }} />
      {LINES.map((width, at) =>
        width ? (
          <Bone key={at} style={{ width, height: 15, borderRadius: 7, marginBottom: 14 }} />
        ) : (
          <View key={at} style={{ height: 14 }} />
        ),
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  skeleton: { paddingHorizontal: 20 },
});
