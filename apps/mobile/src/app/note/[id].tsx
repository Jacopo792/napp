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
  Keyboard,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { File } from "expo-file-system";
import type { HostedNoteState } from "@notes-app/core/hosted";
import { indexOf } from "@/lib/derived";
import { uploadObjectBytes } from "@/lib/supabase";
import {
  assertAttachable,
  attachmentLabel,
  attachmentType,
} from "@/features/editor/lib/attachments";
import type { HostedCommand } from "@/lib/hostedCommands";
import type { SearchStatus } from "@/features/editor/components/RichTextEditor";
import { IconButton } from "../../IconButton";
import { NoteHistory } from "../../NoteHistory";
import { NoteComments } from "../../NoteComments";
import { NotePeople } from "../../NotePeople";
import { useHostedNote } from "../../HostedPage";
import { useTextPrompt } from "../../TextPrompt";
import { attempt } from "../../SettingsControls";
import { useArchive, usePalette } from "../../archive";
import { Faces } from "../../Avatar";
import { WritingBar } from "../../WritingBar";
import { pickPhoto } from "../../ProfilePhoto";
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
  /* Opened from Comments, the sheet waits for the push to land: two native
     transitions at once is the stutter that read as lag. The timer is for a
     push that had no animation to end. */
  const navigation = useNavigation();
  useEffect(() => {
    if (openComments !== "1") return;
    let shown = false;
    const show = () => {
      if (shown) return;
      shown = true;
      setPanel("comments");
    };
    const off = navigation.addListener("transitionEnd" as never, show);
    const timer = setTimeout(show, 700);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [openComments, navigation]);
  const { session, snapshot, metaOf, preferences, setOpenNote, facesOf } = useArchive();
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

  /* Leaving the note puts the pen down: coming back is coming back to read,
     and drawing again is asked for again. */
  const drawingNow = useRef(false);
  drawingNow.current = Boolean(state?.drawing);
  useFocusEffect(
    useCallback(() => {
      setOpenNote(id);
      return () => {
        setOpenNote(null);
        if (drawingNow.current) void execute({ type: "putDownPen" }).catch(() => {});
      };
    }, [id, setOpenNote, execute]),
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
      /* A picture comes from the photo library, as everywhere on a phone; a
         PDF or a video from Files. */
      let file: File;
      if (image) {
        const photo = await pickPhoto();
        if (!photo) return;
        file = photo;
      } else {
        const picked = await File.pickFileAsync({
          mimeTypes: ["application/pdf", "video/mp4", "video/webm", "video/quicktime"],
        });
        if (picked.canceled) return;
        file = picked.result;
        assertAttachable(file);
      }
      setBusy(true);
      try {
        const objectId = randomUUID();
        await uploadObjectBytes(
          session,
          objectId,
          await file.arrayBuffer(),
          image ? "image/jpeg" : attachmentType(file.name),
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
  /* The pen in hand is Markup: the page is the ink's, so both bars make way
     and the header is Done alone, as in Notes. */
  const drawing = Boolean(state?.drawing);

  return (
    <>
      {/* Who else has a hand in this note stands in the bar's middle, as the
          collaborators do in Notes; a status the reader must know takes it. */}
      <Stack.Screen
        options={{
          title: status,
          headerLargeTitle: false,
          /* A stroke to the right is not "go back": the system reads a swipe
             from anywhere on the page as one, and a note closed mid-line. */
          gestureEnabled: !drawing,
          contentStyle: { backgroundColor: palette.canvas },
          headerTitle:
            status || !faces.length
              ? undefined
              : () => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="In this note now"
                    accessibilityHint="Opens People"
                    hitSlop={8}
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
          hidden={!writing || drawing || !state?.format?.canUndo}
          separateBackground
          onPress={() => run({ type: "edit", action: "undo" })}
        />
        <Stack.Toolbar.Menu icon={icon("square.and.arrow.up")} hidden={drawing}>
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
        {/* Only what is nowhere else. Pin, Lock, Move, Archive and Delete are
            the held note's; Format is the writing bar's; Comments, attaching
            and sharing have buttons of their own. A second door to the same
            act is a second thing to read past (Jacopo, 19 October 2026). */}
        <Stack.Toolbar.Menu icon={icon("ellipsis")} hidden={drawing}>
          <Stack.Toolbar.MenuAction icon={icon("magnifyingglass")} onPress={() => setFinding(true)}>
            Find in Note
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon={icon("clock")} onPress={() => setPanel("history")}>
            History
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction icon={icon("person.2")} onPress={() => setPanel("people")}>
            People
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
        <Stack.Toolbar.Button
          icon={icon("checkmark")}
          accessibilityLabel="Done"
          hidden={!writing && !drawing}
          variant="prominent"
          tintColor={palette.accent}
          onPress={() => run(drawing ? { type: "putDownPen" } : { type: "edit", action: "done" })}
        />
      </Stack.Toolbar>
      {/* At rest, Notes' own row; while writing it gives way to the bar on
          the keyboard. */}
      {!keyboard && !drawing ? (
        <Stack.Toolbar tintColor={palette.ink}>
          <Stack.Toolbar.View>
            <IconButton
              icon="checklist"
              label="Checklist"
              disabled={!canEdit || busy}
              onPress={() => run({ type: "format", action: "checklist" })}
            />
          </Stack.Toolbar.View>
          <Stack.Toolbar.Menu icon={icon("paperclip")} disabled={!canEdit || busy}>
            <Stack.Toolbar.MenuAction icon={icon("photo")} onPress={() => attach(true)}>
              Choose Photo
            </Stack.Toolbar.MenuAction>
            <Stack.Toolbar.MenuAction icon={icon("doc")} onPress={() => attach(false)}>
              Attach File
            </Stack.Toolbar.MenuAction>
          </Stack.Toolbar.Menu>
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
      {panel === "people" ? (
        <NotePeople
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
        {canEdit && !panel && !finding && !drawing ? (
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
