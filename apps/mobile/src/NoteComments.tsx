/* Conversations read as annotations on a shared document. Each thread keeps
 * its passage, authors, remarks and actions together on one neutral surface.
 * Both directions of passage navigation use the live editor bridge. */
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { randomUUID } from "expo-crypto";
import {
  addComment,
  assignThread,
  deleteComment,
  loadComments,
  loadReactions,
  resolveThread,
  setReaction,
  updateComment,
} from "@/lib/comments";
import {
  mentionQuery,
  mentionedIn,
  REACTIONS,
  tally,
  threadsOf,
  type ArchiveComment,
  type CommentThread,
  type NoteComment,
  type Reaction,
} from "@/lib/commentThreads";
import { REPORT_REASONS, reportSafetyIssue } from "@/lib/storeSafety";
import { fold, formatStamp } from "@/lib/format";
import type { AppSession } from "@/lib/session";
import { subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import type { HostedCommand } from "@/lib/hostedCommands";
import { Press, quiet } from "./Grouped";
import { attempt, Segments, Status } from "./SettingsControls";
import { useArchive, usePalette, type Palette } from "./archive";
import { useChoice, useTextPrompt } from "./TextPrompt";
import { Avatar, type Face } from "./Avatar";
import { SymbolView } from "./icons";
import { glide, release } from "./theme";

type Execute = <T = unknown>(command: HostedCommand) => Promise<T>;
interface Member {
  userId: string;
  name: string;
  avatarObject: string | null;
}

/** How long ago, as a messaging app says it: "Now", "2m", "3h", then the
 *  list's own stamp — "Yesterday", a weekday, a date. */
function ago(iso: string): string {
  const then = new Date(iso);
  const seconds = (Date.now() - then.getTime()) / 1000;
  if (seconds < 60) return "Now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (then.toDateString() === new Date().toDateString()) return `${Math.floor(seconds / 3600)}h`;
  return formatStamp(iso);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A remark's words with every @name it says drawn out. */
function Words({
  body,
  members,
  color,
  named,
}: {
  body: string;
  members: Member[];
  color: string;
  named: string;
}) {
  const names = members
    .map((member) => member.name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escape);
  const pieces: { text: string; named: boolean }[] = [];
  if (names.length) {
    const pattern = new RegExp(`@(?:${names.join("|")})(?![\\p{L}\\p{N}])`, "giu");
    let at = 0;
    for (const match of body.matchAll(pattern)) {
      if (match.index > at) pieces.push({ text: body.slice(at, match.index), named: false });
      pieces.push({ text: match[0], named: true });
      at = match.index + match[0].length;
    }
    if (at < body.length) pieces.push({ text: body.slice(at), named: false });
  } else pieces.push({ text: body, named: false });
  return (
    <Text style={[styles.body, { color }]}>
      {pieces.map((piece, index) =>
        piece.named ? (
          <Text key={index} style={{ color: named, fontWeight: "600" }}>
            {piece.text}
          </Text>
        ) : (
          piece.text
        ),
      )}
    </Text>
  );
}

/* What a note's conversation said the last time it was read, so the sheet
   opens on it at once and the network only corrects it — a page sheet that
   slides up onto bars and then rebuilds itself reads as lag, and bars on a
   light ground were the flash the sheet arrived with. The note screen reads
   it as the note opens (`preloadComments`); the Comments tab seeds it from
   the archive-wide read it already made. */
interface Known {
  comments: NoteComment[];
  reactions: Reaction[];
  quotes: Map<string, string>;
}
const known = new Map<string, Known>();

/** Read a note's conversation ahead of the sheet, so it opens on words. */
export function preloadComments(session: AppSession, noteId: string): void {
  void Promise.all([loadComments(session, noteId), loadReactions(session, noteId)]).then(
    ([comments, reactions]) => {
      const before = known.get(noteId);
      known.set(noteId, { comments, reactions, quotes: before?.quotes ?? new Map() });
    },
    () => {},
  );
}

/** The archive-wide read, handed down per note. Only when the read is whole:
 *  `loadArchiveComments` stops at 300, and a thread drawn short and then
 *  completed is worse than bars. */
export function rememberArchiveComments(list: ArchiveComment[], whole: boolean) {
  if (!whole) return;
  const byNote = new Map<string, NoteComment[]>();
  for (const comment of list) {
    const rows = byNote.get(comment.noteId) ?? [];
    rows.push(comment);
    byNote.set(comment.noteId, rows);
  }
  for (const [noteId, rows] of byNote) {
    const before = known.get(noteId);
    known.set(noteId, {
      comments: rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      reactions: before?.reactions ?? [],
      quotes: before?.quotes ?? new Map(),
    });
  }
}

/** Where a long-pressed remark stood, so the menu opens over it. */
interface Held {
  comment: NoteComment;
  thread: CommentThread;
  y: number;
  height: number;
}

export function NoteComments({
  noteId,
  canEdit,
  execute,
  onClose,
  anchor,
  thread: focus = null,
}: {
  noteId: string;
  canEdit: boolean;
  execute: Execute;
  onClose: () => void;
  anchor: { threadId: string; quote: string } | null;
  /** The thread to open on, when the reader came from its passage. */
  thread?: string | null;
}) {
  const {
    session,
    snapshot,
    preferences,
    updatePreferences,
    refresh: refreshArchive,
  } = useArchive();
  const latestPreferences = useRef(preferences);
  latestPreferences.current = preferences;
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const prompt = useTextPrompt();
  const choose = useChoice();
  const cached = known.get(noteId);
  const [comments, setComments] = useState<NoteComment[] | null>(() => cached?.comments ?? null);
  const [reactions, setReactions] = useState<Reaction[]>(() => cached?.reactions ?? []);
  const [quotes, setQuotes] = useState<Map<string, string> | null>(() =>
    cached?.quotes.size ? cached.quotes : null,
  );
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"open" | "resolved">(() =>
    focus && cached?.comments.some((c) => c.threadId === focus && c.resolvedAt)
      ? "resolved"
      : "open",
  );
  const [anchorSaved, setAnchorSaved] = useState(false);
  const [held, setHeld] = useState<Held | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const root = useRef<ComponentRef<typeof View>>(null);
  const list = useRef<ComponentRef<typeof ScrollView>>(null);
  /** The thread still to be scrolled to, until its row has been laid out. */
  const seeking = useRef(focus);
  /** Somebody else said something past this note's line while it was open. */
  const owed = useRef(false);

  const members: Member[] = (snapshot?.members ?? []).map((member) => ({
    userId: member.userId,
    name: member.nickname || (member.isSelf ? "You" : "Member"),
    avatarObject: member.avatarObject ?? null,
  }));
  const nameOf = (id: string) =>
    id === session.userId ? "You" : members.find((m) => m.userId === id)?.name || "Former Member";
  const faceOf = (id: string): Face => ({
    userId: id,
    name: members.find((m) => m.userId === id)?.name || "Member",
    avatarObject: members.find((m) => m.userId === id)?.avatarObject ?? null,
  });
  const emailOf = (id: string) => (id === session.userId ? session.email : undefined);

  /* The keyboard, followed frame by frame on the UI thread: a page sheet
     sits offset in the window, which KeyboardAvoidingView measures wrongly
     and leaves the composer under the keys. */
  const keyboard = useAnimatedKeyboard();
  const bottom = Math.max(inset.bottom, 12);
  const lifted = useAnimatedStyle(() => ({ paddingBottom: keyboard.height.value }));
  const composerFoot = useAnimatedStyle(() => ({
    paddingBottom: Math.max(8, bottom - keyboard.height.value),
  }));

  /* The passages come from the live document, never its saved projection:
     a remark made a moment ago must already show what it is about. Asked as
     the passages alone — the whole body of a long note is a lot to send
     across the bridge to read a few lines out of it. */
  const readQuotes = useCallback(
    () =>
      void execute<Record<string, string>>({ type: "commentQuotes" }).then(
        (found) => setQuotes(new Map(Object.entries(found))),
        () => setQuotes((prev) => prev ?? new Map()),
      ),
    [execute],
  );
  const load = useCallback(async () => {
    const [rows, answers] = await Promise.all([
      loadComments(session, noteId),
      loadReactions(session, noteId),
    ]);
    return { rows, answers };
  }, [session, noteId]);
  useEffect(() => {
    let live = true;
    let revision = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      const request = ++revision;
      readQuotes();
      void load().then(
        ({ rows, answers }) => {
          if (live && request === revision) {
            setComments(rows);
            setReactions(answers);
            setError("");
            const seen = latestPreferences.current.remarksSeen[noteId] ?? "";
            if (rows.some((row) => row.authorId !== session.userId && row.createdAt > seen))
              owed.current = true;
          }
        },
        (reason) => {
          if (live) setError(String(reason));
        },
      );
    };
    refresh();
    /* Realtime announces every row of a resolve separately; one read answers
       the burst, as `refreshRemarks` does on the web. */
    const channel = subscribeToComments(session.archiveId, () => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      void unsubscribeFromArchive(channel);
    };
  }, [load, readQuotes, session.archiveId, session.userId, noteId]);
  /* Having read it is written once, as the sheet goes, and only when
     somebody else had said something past the line: a preferences write
     redraws every screen and re-sends the open note its preferences, and
     doing that as the remarks landed — and again per Realtime event — was
     the stall the sheet arrived with. */
  useEffect(
    () => () => {
      if (!owed.current) return;
      updatePreferences({
        remarksSeen: {
          ...latestPreferences.current.remarksSeen,
          [noteId]: new Date().toISOString(),
        },
      });
    },
    [noteId, updatePreferences],
  );
  useEffect(() => {
    if (comments) known.set(noteId, { comments, reactions, quotes: quotes ?? new Map() });
  }, [noteId, comments, reactions, quotes]);
  /* A resolved thread asked for is on the other side of the switch. */
  useEffect(() => {
    if (focus && comments?.some((c) => c.threadId === focus && c.resolvedAt)) setFilter("resolved");
  }, [focus, comments]);
  const refresh = async () => {
    const { rows, answers } = await load();
    setComments(rows);
    setReactions(answers);
  };

  const threads = threadsOf(comments ?? []);
  const open = threads.filter((thread) => !thread.resolved);
  const resolved = threads.filter((thread) => thread.resolved);
  const shown = filter === "open" ? open : resolved;
  const starting = Boolean(anchor && !anchorSaved);
  /* The list is drawn once it can be drawn whole — the remarks and what they
     are about — so a quote never arrives late and pushes everything down. */
  const drawn = Boolean(comments && quotes);

  const close = () => {
    if (anchor && !anchorSaved)
      void execute({ type: "removeComment", threadId: anchor.threadId }).catch(() => {});
    onClose();
  };
  const action = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  const send = () =>
    void attempt(() =>
      action(async () => {
        if (!canEdit || !draft.trim()) return;
        const thread = threads.find((t) => t.threadId === reply);
        const threadId = reply ?? (starting && anchor ? anchor.threadId : randomUUID());
        await addComment(
          session,
          noteId,
          threadId,
          draft,
          mentionedIn(draft, members),
          thread?.assigneeId ?? null,
        );
        if (anchor?.threadId === threadId) setAnchorSaved(true);
        setDraft("");
        setReply(null);
        setFilter("open");
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      }),
    );
  const replyTo = (thread: CommentThread) => {
    setReply(thread.threadId);
    input.current?.focus();
  };
  const react = (comment: NoteComment, emoji: string, on: boolean) =>
    void attempt(() => action(() => setReaction(session, noteId, comment.id, emoji, on)));
  /* The sheet goes at once and the note finds the passage under it: waiting
     for the answer first held the sheet up for as long as a long note took
     to arrive. The page lights the passage after it has scrolled there. */
  const reveal = (thread: CommentThread) => {
    if (!quotes?.get(thread.threadId)) return;
    void Haptics.selectionAsync().catch(() => {});
    close();
    void execute<boolean>({ type: "revealComment", threadId: thread.threadId }).then(
      (found) => {
        if (!found) Alert.alert("This comment has no passage in the current text");
      },
      () => {},
    );
  };
  const toggleResolved = (thread: CommentThread) =>
    void attempt(async () => {
      if (busy) return;
      setBusy(true);
      try {
        await resolveThread(session, noteId, thread.threadId, !thread.resolved);
        // The database accepted it: move this thread between the tabs in place.
        // There is no archive reload or loading state to replace the sheet.
        const resolvedAt = thread.resolved ? null : new Date().toISOString();
        setComments(
          (rows) =>
            rows?.map((row) => (row.threadId === thread.threadId ? { ...row, resolvedAt } : row)) ??
            null,
        );
        await execute({
          type: "resolveComment",
          threadId: thread.threadId,
          resolved: !thread.resolved,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } finally {
        setBusy(false);
      }
    });
  const assign = (thread: CommentThread) =>
    choose("Assign To", [
      ...members.map((member) => ({
        label: nameOf(member.userId),
        icon: thread.assigneeId === member.userId ? ("checkmark" as const) : ("person" as const),
        run: () =>
          void attempt(() =>
            action(() => assignThread(session, noteId, thread.threadId, member.userId)),
          ),
      })),
      {
        label: "Nobody",
        icon: thread.assigneeId ? ("person.slash" as const) : ("checkmark" as const),
        run: () =>
          void attempt(() => action(() => assignThread(session, noteId, thread.threadId, null))),
      },
    ]);
  const removeOne = (comment: NoteComment, thread: CommentThread) =>
    Alert.alert("Delete Comment?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void attempt(() =>
            action(async () => {
              await deleteComment(session, comment.id);
              if (thread.comments.length === 1)
                await execute({ type: "removeComment", threadId: thread.threadId });
            }),
          ),
      },
    ]);
  /* Deleting is the author's alone, so a whole thread is offered only to
     the one who wrote every remark in it. */
  const removeThread = (thread: CommentThread) =>
    Alert.alert("Delete Thread?", undefined, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          void attempt(() =>
            action(async () => {
              for (const comment of thread.comments) await deleteComment(session, comment.id);
              await execute({ type: "removeComment", threadId: thread.threadId });
            }),
          ),
      },
    ]);
  const more = (thread: CommentThread) =>
    choose("Thread", [
      ...(quotes?.get(thread.threadId)
        ? [{ label: "Show in Note", icon: "text.quote" as const, run: () => reveal(thread) }]
        : []),
      {
        label: "Assign…",
        icon: "person.badge.plus",
        run: () => assign(thread),
        disabled: !canEdit,
      },
      {
        label: "Delete Thread",
        icon: "trash",
        destructive: true,
        run: () => removeThread(thread),
        disabled: !canEdit || thread.comments.some((c) => c.authorId !== session.userId),
      },
    ]);
  const hold = (
    comment: NoteComment,
    thread: CommentThread,
    target: ComponentRef<typeof View> | null,
  ) => {
    if (!target || !root.current) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    root.current.measureInWindow((_rx, ry) =>
      target.measureInWindow((_x, y, _w, height) =>
        setHeld({ comment, thread, y: y - ry, height }),
      ),
    );
  };
  /* The thread asked for, scrolled to without motion — the sheet is already
     moving — a little below the top, and lit once it is there. */
  const placed = (threadId: string, y: number) => {
    if (seeking.current !== threadId) return;
    seeking.current = null;
    list.current?.scrollTo({ y: Math.max(0, y - 12), animated: false });
    setLit(threadId);
  };

  /* The @ being typed, and who it could be. */
  const query = canEdit ? mentionQuery(draft, caret) : null;
  const suggestions =
    query === null
      ? []
      : members.filter(
          (member) => member.userId !== session.userId && fold(member.name).startsWith(fold(query)),
        );
  const mention = (member: Member) => {
    const before = draft.slice(0, caret).replace(/@[\p{L}\p{N}._-]*$/u, `@${member.name} `);
    const next = before + draft.slice(caret);
    setDraft(next);
    setCaret(before.length);
  };

  const replying = threads.find((thread) => thread.threadId === reply);
  const ready = Boolean(draft.trim()) && !busy;

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      backdropColor={palette.page}
      onRequestClose={close}
    >
      <View ref={root} style={{ flex: 1, backgroundColor: palette.page }}>
        <Animated.View style={[{ flex: 1 }, lifted]}>
          <View
            style={[styles.header, { paddingTop: Platform.OS === "android" ? inset.top + 10 : 14 }]}
          >
            <Text
              accessibilityRole="header"
              style={[styles.title, { color: palette.ink, flex: 1 }]}
            >
              Comments
            </Text>
            <View style={[styles.headerSide, { alignItems: "flex-end" }]}>
              <Press
                feedback="scale"
                accessibilityRole="button"
                accessibilityLabel="Done"
                hitSlop={8}
                onPress={close}
                style={[styles.round, { backgroundColor: quiet(palette) }]}
              >
                <SymbolView name="xmark" size={14} weight="bold" tintColor={palette.ink2} />
              </Press>
            </View>
          </View>
          <View style={styles.segments}>
            <Segments
              options={[
                { id: "open" as const, label: open.length ? `Open  ${open.length}` : "Open" },
                {
                  id: "resolved" as const,
                  label: resolved.length ? `Resolved  ${resolved.length}` : "Resolved",
                },
              ]}
              value={filter}
              onChange={(next) => {
                if (next === filter) return;
                void Haptics.selectionAsync().catch(() => {});
                setFilter(next);
              }}
            />
          </View>
          <ScrollView
            ref={list}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingTop: 16, paddingBottom: 24, flexGrow: 1 }}
          >
            {error ? <Status>{error}</Status> : null}
            {starting && anchor ? (
              <Animated.View entering={FadeIn.duration(220)} style={styles.thread}>
                <Quote text={anchor.quote} palette={palette} />
                <Text style={[styles.hint, { color: palette.ink3 }]}>New comment</Text>
              </Animated.View>
            ) : null}
            {!drawn ? null : !shown.length && !starting ? (
              <EmptyThreads resolved={filter === "resolved"} palette={palette} />
            ) : (
              shown.map((thread) => (
                <Animated.View
                  key={thread.threadId}
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(160)}
                  onLayout={(event) => placed(thread.threadId, event.nativeEvent.layout.y)}
                >
                  <View
                    style={[
                      styles.thread,
                      { backgroundColor: palette.paper, borderColor: palette.rule },
                    ]}
                  >
                    {lit === thread.threadId ? <Glow palette={palette} /> : null}
                    {quotes?.get(thread.threadId) ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Show in note"
                        hitSlop={4}
                        onPress={() => reveal(thread)}
                      >
                        {({ pressed }) => (
                          <View style={{ opacity: pressed ? 0.5 : 1 }}>
                            <Quote text={quotes.get(thread.threadId)!} palette={palette} />
                          </View>
                        )}
                      </Pressable>
                    ) : null}
                    {thread.comments.map((comment, at) => {
                      return (
                        <Bubble
                          key={comment.id}
                          comment={comment}
                          mine={comment.authorId === session.userId}
                          head={at === 0}
                          name={nameOf(comment.authorId)}
                          face={faceOf(comment.authorId)}
                          members={members}
                          counts={tally(reactions, comment.id, session.userId)}
                          lifted={held?.comment.id === comment.id}
                          canReact={canEdit && !busy}
                          onPress={() => reveal(thread)}
                          onReact={(emoji, on) => react(comment, emoji, on)}
                          onHold={(target) => hold(comment, thread, target)}
                          palette={palette}
                        />
                      );
                    })}
                    <View style={styles.foot}>
                      {thread.assigneeId ? (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Assigned to ${nameOf(thread.assigneeId)}`}
                          disabled={!canEdit}
                          hitSlop={8}
                          onPress={() => assign(thread)}
                          style={styles.assignee}
                        >
                          <Avatar
                            face={faceOf(thread.assigneeId)}
                            email={emailOf(thread.assigneeId)}
                            size={18}
                            neutral
                          />
                          <Text
                            numberOfLines={1}
                            style={[styles.footText, { color: palette.ink3 }]}
                          >
                            {thread.assigneeId === session.userId
                              ? "Assigned to you"
                              : `For ${nameOf(thread.assigneeId)}`}
                          </Text>
                        </Pressable>
                      ) : null}
                      {canEdit && !thread.resolved ? (
                        <Word label="Reply" color={palette.ink2} onPress={() => replyTo(thread)} />
                      ) : null}
                      {canEdit ? (
                        <Word
                          label={thread.resolved ? "Reopen" : "Resolve"}
                          color={palette.ink2}
                          disabled={busy}
                          onPress={() => toggleResolved(thread)}
                        />
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="More"
                        hitSlop={10}
                        onPress={() => more(thread)}
                        style={({ pressed }) => [styles.more, { opacity: pressed ? 0.4 : 1 }]}
                      >
                        <SymbolView name="ellipsis" size={20} tintColor={palette.ink3} />
                      </Pressable>
                    </View>
                  </View>
                </Animated.View>
              ))
            )}
          </ScrollView>
          {canEdit ? (
            <Animated.View style={[styles.composer, composerFoot]}>
              {suggestions.length ? (
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="always"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 10, paddingHorizontal: 4 }}
                >
                  {suggestions.map((member) => (
                    <Press
                      key={member.userId}
                      feedback="scale"
                      accessibilityRole="button"
                      accessibilityLabel={`Mention ${member.name}`}
                      onPress={() => mention(member)}
                      style={[styles.mentionChip, { backgroundColor: quiet(palette) }]}
                    >
                      <Avatar face={faceOf(member.userId)} size={22} />
                      <Text style={[styles.mentionText, { color: palette.ink }]}>
                        {member.name}
                      </Text>
                    </Press>
                  ))}
                </ScrollView>
              ) : null}
              {replying ? (
                <View style={styles.context}>
                  <Text numberOfLines={1} style={[styles.contextText, { color: palette.ink3 }]}>
                    Replying to {nameOf(replying.comments[0].authorId)}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Cancel reply"
                    hitSlop={10}
                    onPress={() => setReply(null)}
                  >
                    <SymbolView name="xmark.circle.fill" size={17} tintColor={palette.ink4} />
                  </Pressable>
                </View>
              ) : null}
              <View
                style={[styles.pill, { borderColor: palette.rule, backgroundColor: palette.paper }]}
              >
                <TextInput
                  ref={input}
                  accessibilityLabel="Comment"
                  multiline
                  autoFocus={starting}
                  placeholder={
                    replying ? "Reply" : starting ? "Say something about this" : "Comment"
                  }
                  placeholderTextColor={palette.ink3}
                  value={draft}
                  onChangeText={setDraft}
                  onSelectionChange={(event) => setCaret(event.nativeEvent.selection.end)}
                  style={[styles.field, { color: palette.ink }]}
                />
                <SendButton ready={ready} onPress={send} palette={palette} />
              </View>
            </Animated.View>
          ) : null}
        </Animated.View>
        {held ? (
          <HeldMenu
            held={held}
            mine={held.comment.authorId === session.userId}
            members={members}
            counts={tally(reactions, held.comment.id, session.userId)}
            canEdit={canEdit}
            open={!held.thread.resolved}
            palette={palette}
            onClose={() => setHeld(null)}
            onReact={(emoji, on) => react(held.comment, emoji, on)}
            onReply={() => replyTo(held.thread)}
            onEdit={() =>
              prompt(
                "Edit Comment",
                undefined,
                (body) =>
                  void attempt(() =>
                    action(() =>
                      updateComment(session, held.comment.id, body, mentionedIn(body, members)),
                    ),
                  ),
                "plain-text",
                held.comment.body,
              )
            }
            onDelete={() => removeOne(held.comment, held.thread)}
            onReport={() =>
              choose(
                "Report comment",
                REPORT_REASONS.map((reason) => ({
                  label: reason.label,
                  run: () =>
                    void attempt(async () => {
                      await reportSafetyIssue({
                        reason: reason.value,
                        noteId,
                        commentId: held.comment.id,
                      });
                      known.delete(noteId);
                      onClose();
                      refreshArchive();
                      Alert.alert(
                        "Report submitted",
                        "The developer can review the reported content. The note is hidden from you while the report is pending.",
                      );
                    }),
                })),
              )
            }
          />
        ) : null}
      </View>
    </Modal>
  );
}

/** Secondary actions share a quiet, consistent hit area. */
function Word({
  label,
  color,
  disabled,
  onPress,
}: {
  label: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.threadAction, { opacity: pressed || disabled ? 0.4 : 1 }]}
    >
      <Text style={[styles.footWord, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** The thread the reader came for, lit once and let go. */
function Glow({ palette }: { palette: Palette }) {
  const on = useSharedValue(0);
  useEffect(() => {
    on.value = withTiming(1, { duration: 220 }, () => {
      "worklet";
      on.value = withDelay(900, withTiming(0, { duration: 900 }));
    });
  }, [on]);
  const look = useAnimatedStyle(() => ({ opacity: on.value }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        styles.glow,
        { backgroundColor: palette.dark ? "#ffffff14" : "#0000000a" },
        look,
      ]}
    />
  );
}

function Quote({ text, palette }: { text: string; palette: Palette }) {
  return (
    <View style={[styles.quote, { backgroundColor: quiet(palette) }]}>
      <View style={[styles.quoteBar, { backgroundColor: palette.ink3 }]} />
      <Text numberOfLines={2} style={[styles.quoteText, { color: palette.ink2 }]}>
        {text}
      </Text>
      <SymbolView name="arrow.up.forward" size={13} tintColor={palette.ink3} />
    </View>
  );
}

function EmptyThreads({ resolved, palette }: { resolved: boolean; palette: Palette }) {
  return (
    <Animated.View entering={FadeIn.duration(240)} style={styles.empty}>
      <SymbolView
        name={resolved ? "checkmark.bubble" : "bubble.left.and.bubble.right"}
        size={34}
        tintColor={palette.ink4}
      />
      <Text style={[styles.emptyTitle, { color: palette.ink3 }]}>
        {resolved ? "Nothing resolved yet" : "No open comments"}
      </Text>
    </Animated.View>
  );
}

function SendButton({
  ready,
  onPress,
  palette,
}: {
  ready: boolean;
  onPress: () => void;
  palette: Palette;
}) {
  const on = useSharedValue(ready ? 1 : 0);
  useEffect(() => {
    on.value = withSpring(ready ? 1 : 0, release);
  }, [ready, on]);
  const look = useAnimatedStyle(() => ({
    opacity: 0.25 + 0.75 * on.value,
  }));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Send"
      accessibilityState={{ disabled: !ready }}
      disabled={!ready}
      onPress={onPress}
      hitSlop={6}
    >
      <Animated.View style={[styles.send, { backgroundColor: palette.ink }, look]}>
        <SymbolView name="arrow.up" size={15} weight="bold" tintColor={palette.paper} />
      </Animated.View>
    </Pressable>
  );
}

type Counts = ReturnType<typeof tally>;

/** All authors share the same document-oriented reading direction. */
function Bubble({
  comment,
  mine,
  head,
  name,
  face,
  members,
  counts,
  lifted,
  canReact,
  onPress,
  onReact,
  onHold,
  palette,
}: {
  comment: NoteComment;
  mine: boolean;
  head: boolean;
  name: string;
  face: Face;
  members: Member[];
  counts: Counts;
  lifted: boolean;
  canReact: boolean;
  onPress: () => void;
  onReact: (emoji: string, on: boolean) => void;
  onHold: (target: ComponentRef<typeof View> | null) => void;
  palette: Palette;
}) {
  const box = useRef<ComponentRef<typeof View>>(null);
  const down = useSharedValue(0);
  const give = useAnimatedStyle(() => ({ transform: [{ scale: 1 - 0.03 * down.value }] }));
  return (
    <View
      style={[
        styles.entry,
        !head && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: palette.rule },
      ]}
    >
      <View style={styles.byline}>
        <Avatar face={face} size={24} neutral />
        <Text numberOfLines={1} style={[styles.author, { color: palette.ink }]}>
          {mine ? "You" : name}
        </Text>
        <Text style={[styles.timestamp, { color: palette.ink3 }]}>{ago(comment.createdAt)}</Text>
      </View>
      <Pressable
        accessibilityHint="Hold for reactions and more"
        delayLongPress={300}
        onPress={onPress}
        onLongPress={() => onHold(box.current)}
        onPressIn={() => {
          down.value = withTiming(1, { duration: 300 });
        }}
        onPressOut={() => {
          down.value = withSpring(0, release);
        }}
      >
        <Animated.View ref={box} collapsable={false} style={[{ opacity: lifted ? 0 : 1 }, give]}>
          <Words body={comment.body} members={members} color={palette.ink} named={palette.ink} />
        </Animated.View>
      </Pressable>
      {counts.length ? (
        <View style={styles.reactions}>
          {counts.map((one) => (
            <Pressable
              key={one.emoji}
              accessibilityRole="button"
              accessibilityLabel={`${one.emoji} ${one.count}${one.mine ? ", remove yours" : ""}`}
              disabled={!canReact}
              onPress={() => onReact(one.emoji, !one.mine)}
              style={[
                styles.reaction,
                {
                  backgroundColor: palette.paper,
                  borderColor: one.mine ? palette.ink3 : palette.rule,
                },
              ]}
            >
              <Text style={{ fontSize: 13 }}>{one.emoji}</Text>
              {one.count > 1 ? (
                <Text style={[styles.reactionCount, { color: palette.ink2 }]}>{one.count}</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** The long press: the bubble lifted where it stood, the six reactions over
 *  it and its acts under it, the rest of the sheet dimmed behind. */
function HeldMenu({
  held,
  mine,
  members,
  counts,
  canEdit,
  open,
  palette,
  onClose,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  held: Held;
  mine: boolean;
  members: Member[];
  counts: Counts;
  canEdit: boolean;
  open: boolean;
  palette: Palette;
  onClose: () => void;
  onReact: (emoji: string, on: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const inset = useSafeAreaInsets();
  const [frame, setFrame] = useState<{ height: number; stack: number } | null>(null);
  const shown = useSharedValue(0);
  useEffect(() => {
    if (frame) shown.value = withSpring(1, glide);
  }, [frame, shown]);
  const lift = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.94 + 0.06 * shown.value }],
  }));
  const dim = useAnimatedStyle(() => ({ opacity: shown.value }));
  const leave = (then?: () => void) => {
    shown.value = withTiming(0, { duration: 140 });
    setTimeout(() => {
      onClose();
      then?.();
    }, 140);
  };
  const ROW = 50;
  const acts: {
    label: string;
    icon: Parameters<typeof SymbolView>[0]["name"];
    run: () => void;
    danger?: boolean;
  }[] = [
    ...(!mine ? [{ label: "Report comment", icon: "flag" as const, run: onReport }] : []),
    ...(canEdit && open
      ? [{ label: "Reply", icon: "arrowshape.turn.up.left" as const, run: onReply }]
      : []),
    ...(canEdit && mine ? [{ label: "Edit", icon: "pencil" as const, run: onEdit }] : []),
    ...(canEdit && mine
      ? [{ label: "Delete", icon: "trash" as const, run: onDelete, danger: true }]
      : []),
  ];
  /* Over the remark when there is room; pushed up from the foot when not. */
  const reactionsHeight = canEdit ? 60 : 0;
  const top = frame
    ? Math.max(
        inset.top + 8,
        Math.min(held.y - reactionsHeight, frame.height - frame.stack - Math.max(inset.bottom, 16)),
      )
    : held.y - reactionsHeight;
  const mineOf = (emoji: string) => counts.find((one) => one.emoji === emoji)?.mine ?? false;
  const side = "flex-start" as const;
  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={(event) =>
        setFrame((prev) => ({
          height: event.nativeEvent.layout.height,
          stack: prev?.stack ?? 0,
        }))
      }
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.dark ? "#000000a6" : "#00000040" },
          dim,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={StyleSheet.absoluteFill}
          onPress={() => leave()}
        />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        onLayout={(event) => {
          const stack = event.nativeEvent.layout.height;
          setFrame((prev) =>
            prev && prev.stack === stack ? prev : { height: prev?.height ?? 0, stack },
          );
        }}
        style={[styles.held, { top }, lift]}
      >
        {canEdit ? (
          <View style={[styles.tapbacks, { backgroundColor: palette.paper, alignSelf: side }]}>
            {REACTIONS.map((emoji) => (
              <Press
                key={emoji}
                feedback="scale"
                accessibilityRole="button"
                accessibilityLabel={`${emoji}${mineOf(emoji) ? ", remove reaction" : ""}`}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => {});
                  onReact(emoji, !mineOf(emoji));
                  leave();
                }}
                style={[
                  styles.tapback,
                  mineOf(emoji) && { backgroundColor: palette.dark ? "#ffffff2b" : "#0000001a" },
                ]}
              >
                <Text style={{ fontSize: 24 }}>{emoji}</Text>
              </Press>
            ))}
          </View>
        ) : null}
        <View
          style={[
            styles.bubble,
            {
              alignSelf: side,
              backgroundColor: palette.paper,
            },
          ]}
        >
          <Words
            body={held.comment.body}
            members={members}
            color={palette.ink}
            named={palette.ink}
          />
        </View>
        {acts.length ? (
          <View style={[styles.acts, { backgroundColor: palette.paper, alignSelf: side }]}>
            {acts.map((act, index) => (
              <Press
                key={act.label}
                accessibilityRole="button"
                onPress={() => leave(act.run)}
                style={[
                  styles.act,
                  { height: ROW },
                  index > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderColor: palette.rule,
                  },
                ]}
              >
                <Text
                  style={[styles.actText, { color: act.danger ? palette.danger : palette.ink }]}
                >
                  {act.label}
                </Text>
                <SymbolView
                  name={act.icon}
                  size={17}
                  tintColor={act.danger ? palette.danger : palette.ink}
                />
              </Press>
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerSide: { flex: 1 },
  title: { fontSize: 26, fontWeight: "600", letterSpacing: -0.8 },
  round: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  segments: { marginHorizontal: 16, marginBottom: 2 },
  rule: { height: StyleSheet.hairlineWidth, marginLeft: 62, marginRight: 16 },
  thread: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    paddingBottom: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    borderCurve: "continuous",
  },
  glow: { marginHorizontal: 6, borderRadius: 18, borderCurve: "continuous" },
  hint: { fontSize: 13, paddingTop: 12 },
  quote: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10 },
  quoteBar: { width: 2, alignSelf: "stretch", borderRadius: 1 },
  quoteText: { flex: 1, fontSize: 14, lineHeight: 19 },
  byline: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  author: { flex: 1, fontSize: 13, fontWeight: "600" },
  timestamp: { fontSize: 12 },
  entry: { paddingVertical: 16 },
  threadAction: { minHeight: 40, justifyContent: "center", paddingHorizontal: 4 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  faceColumn: { width: 28 },
  bubbleSlot: { maxWidth: "78%" },
  bubble: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    borderCurve: "continuous",
  },
  body: { fontSize: 16, lineHeight: 24 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 10 },
  reaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 24,
    minWidth: 24,
    paddingHorizontal: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
  },
  reactionCount: { fontSize: 12, fontWeight: "600" },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "#88888826",
    minHeight: 44,
  },
  assignee: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  footText: { fontSize: 13 },
  footWord: { fontSize: 14, fontWeight: "500" },
  more: {
    marginLeft: "auto",
    minWidth: 40,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  composer: { paddingHorizontal: 12, paddingTop: 8 },
  mentionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 30,
    paddingLeft: 4,
    paddingRight: 11,
    borderRadius: 15,
  },
  mentionText: { fontSize: 14, fontWeight: "600" },
  context: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  contextText: { flex: 1, fontSize: 13 },
  pill: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 7,
  },
  field: {
    flex: 1,
    fontSize: 16,
    minHeight: 46,
    maxHeight: 120,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 0,
    textAlignVertical: "top",
  },
  send: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 9,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: "500", letterSpacing: -0.3 },
  held: { position: "absolute", left: 16, right: 16, gap: 8 },
  tapbacks: {
    flexDirection: "row",
    padding: 4,
    gap: 2,
    borderRadius: 26,
    borderCurve: "continuous",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
  },
  tapback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  acts: {
    minWidth: 220,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  act: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  actText: { fontSize: 16 },
});
