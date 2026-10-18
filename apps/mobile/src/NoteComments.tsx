/* A note's conversations, drawn as a messaging thread rather than a form
 * (Jacopo, 18 October 2026: "the most horrible part of the app"). Open and
 * Resolved are a segmented choice, not a checkbox. Each thread is a card: the
 * passage it is about at the top — pressed, the note shows it — then the
 * remarks as rows with a face, a name and how long ago, the same author's
 * next remarks gathered under one face. A reaction is drawn only once
 * somebody has given it; giving one, replying, editing and deleting are the
 * long press on a remark, iMessage's tapback. The thread's own acts sit in a
 * compact foot: whose job it is, Resolve, and ⋯ for the rest. The composer is
 * a pill pinned over the keyboard, and an @ in it offers the members. */
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
  quotesOf,
  REACTIONS,
  tally,
  threadsOf,
  type CommentThread,
  type NoteComment,
  type Reaction,
} from "@/lib/commentThreads";
import { fold, formatStamp } from "@/lib/format";
import { subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import type { HostedBody, HostedCommand } from "@/lib/hostedCommands";
import { Card, Press, quiet } from "./Grouped";
import { attempt, Segments, Status } from "./SettingsControls";
import { useArchive, usePalette, type Palette } from "./archive";
import { useChoice, useTextPrompt } from "./TextPrompt";
import { Avatar, type Face } from "./Avatar";
import { SymbolView } from "./icons";
import { SkeletonCard } from "./Chrome";
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

/** A remark's words with every @name it says drawn in the accent. */
function Words({ body, members, palette }: { body: string; members: Member[]; palette: Palette }) {
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
    <Text style={[styles.body, { color: palette.ink }]}>
      {pieces.map((piece, index) =>
        piece.named ? (
          <Text key={index} style={{ color: palette.accent, fontWeight: "600" }}>
            {piece.text}
          </Text>
        ) : (
          piece.text
        ),
      )}
    </Text>
  );
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
}: {
  noteId: string;
  canEdit: boolean;
  execute: Execute;
  onClose: () => void;
  anchor: { threadId: string; quote: string } | null;
}) {
  const { session, snapshot, preferences, updatePreferences } = useArchive();
  const latestPreferences = useRef(preferences);
  latestPreferences.current = preferences;
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const prompt = useTextPrompt();
  const choose = useChoice();
  const [comments, setComments] = useState<NoteComment[] | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [quotes, setQuotes] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [caret, setCaret] = useState(0);
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"open" | "resolved">("open");
  const [anchorSaved, setAnchorSaved] = useState(false);
  const [held, setHeld] = useState<Held | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const root = useRef<ComponentRef<typeof View>>(null);

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
     a remark made a moment ago must already show what it is about. */
  const readQuotes = useCallback(
    () =>
      void execute<HostedBody>({ type: "body" }).then(
        (body) => setQuotes(quotesOf(body.content)),
        () => {},
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
    const refresh = () => {
      const request = ++revision;
      readQuotes();
      void load().then(
        ({ rows, answers }) => {
          if (live && request === revision) {
            setComments(rows);
            setReactions(answers);
            setError("");
            updatePreferences({
              remarksSeen: {
                ...latestPreferences.current.remarksSeen,
                [noteId]: new Date().toISOString(),
              },
            });
          }
        },
        (reason) => {
          if (live) setError(String(reason));
        },
      );
    };
    refresh();
    const channel = subscribeToComments(session.archiveId, refresh);
    return () => {
      live = false;
      void unsubscribeFromArchive(channel);
    };
  }, [load, readQuotes, session.archiveId, noteId, updatePreferences]);
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
  const reveal = (thread: CommentThread) =>
    void attempt(async () => {
      const found = await execute<boolean>({ type: "revealComment", threadId: thread.threadId });
      if (found) close();
      else Alert.alert("This comment has no passage in the current text");
    });
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
      { label: "Show Passage", icon: "text.quote", run: () => reveal(thread) },
      {
        label: "Assign…",
        icon: "person.badge.plus",
        run: () => assign(thread),
        disabled: !canEdit,
      },
      {
        label: thread.resolved ? "Reopen" : "Resolve",
        icon: thread.resolved ? "arrow.uturn.backward" : "checkmark",
        run: () => toggleResolved(thread),
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
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View ref={root} style={{ flex: 1, backgroundColor: palette.page }}>
        <Animated.View style={[{ flex: 1 }, lifted]}>
          <View
            style={[styles.header, { paddingTop: Platform.OS === "android" ? inset.top + 14 : 20 }]}
          >
            <Text accessibilityRole="header" style={[styles.title, { color: palette.ink }]}>
              Comments
            </Text>
            {comments ? (
              <Text style={[styles.count, { color: palette.ink3 }]}>{threads.length}</Text>
            ) : null}
            <View style={{ flex: 1 }} />
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
          <View style={{ marginHorizontal: 4, marginBottom: 4 }}>
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
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, flexGrow: 1 }}
          >
            {error ? <Status>{error}</Status> : null}
            {starting && anchor ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <Card style={styles.thread}>
                  <Quote text={anchor.quote} palette={palette} />
                  <Text style={[styles.hint, { color: palette.ink3 }]}>New comment</Text>
                </Card>
              </Animated.View>
            ) : null}
            {!comments ? (
              <>
                <SkeletonCard rows={2} />
                <SkeletonCard rows={1} />
              </>
            ) : !shown.length && !starting ? (
              <EmptyThreads resolved={filter === "resolved"} palette={palette} />
            ) : (
              shown.map((thread) => (
                <Animated.View
                  key={thread.threadId}
                  entering={FadeIn.duration(220)}
                  exiting={FadeOut.duration(160)}
                >
                  <Card style={[styles.thread, thread.resolved && { opacity: 0.85 }]}>
                    {quotes.get(thread.threadId) ? (
                      <Press
                        accessibilityRole="button"
                        accessibilityLabel="Show passage in the note"
                        onPress={() => reveal(thread)}
                      >
                        <Quote text={quotes.get(thread.threadId)!} palette={palette} />
                      </Press>
                    ) : (
                      <View style={{ height: 6 }} />
                    )}
                    {thread.comments.map((comment, index) => (
                      <Message
                        key={comment.id}
                        comment={comment}
                        first={thread.comments[index - 1]?.authorId !== comment.authorId}
                        name={nameOf(comment.authorId)}
                        face={faceOf(comment.authorId)}
                        email={emailOf(comment.authorId)}
                        members={members}
                        counts={tally(reactions, comment.id, session.userId)}
                        lifted={held?.comment.id === comment.id}
                        canReact={canEdit && !busy}
                        onReact={(emoji, on) => react(comment, emoji, on)}
                        onHold={(target) => hold(comment, thread, target)}
                        palette={palette}
                      />
                    ))}
                    <View style={[styles.foot, { borderColor: palette.rule }]}>
                      {thread.assigneeId ? (
                        <Press
                          feedback="scale"
                          accessibilityRole="button"
                          accessibilityLabel={`Assigned to ${nameOf(thread.assigneeId)}`}
                          disabled={!canEdit}
                          onPress={() => assign(thread)}
                          style={[styles.chip, { backgroundColor: quiet(palette) }]}
                        >
                          <Avatar
                            face={faceOf(thread.assigneeId)}
                            email={emailOf(thread.assigneeId)}
                            size={20}
                          />
                          <Text
                            numberOfLines={1}
                            style={[styles.chipText, { color: palette.ink, flexShrink: 1 }]}
                          >
                            {thread.assigneeId === session.userId
                              ? "Assigned to You"
                              : nameOf(thread.assigneeId)}
                          </Text>
                        </Press>
                      ) : null}
                      <View style={{ flex: 1 }} />
                      {canEdit && !thread.resolved ? (
                        <Press
                          feedback="scale"
                          accessibilityRole="button"
                          accessibilityLabel="Reply"
                          onPress={() => replyTo(thread)}
                          style={[styles.round, { backgroundColor: quiet(palette) }]}
                        >
                          <SymbolView
                            name="arrowshape.turn.up.left"
                            size={15}
                            weight="semibold"
                            tintColor={palette.ink}
                          />
                        </Press>
                      ) : null}
                      {canEdit ? (
                        <Press
                          feedback="scale"
                          accessibilityRole="button"
                          disabled={busy}
                          onPress={() => toggleResolved(thread)}
                          style={[
                            styles.chip,
                            {
                              backgroundColor: thread.resolved ? quiet(palette) : palette.ink,
                              paddingHorizontal: 14,
                            },
                          ]}
                        >
                          <SymbolView
                            name={thread.resolved ? "arrow.uturn.backward" : "checkmark"}
                            size={13}
                            weight="bold"
                            tintColor={thread.resolved ? palette.ink : palette.page}
                          />
                          <Text
                            style={[
                              styles.chipText,
                              { color: thread.resolved ? palette.ink : palette.page },
                            ]}
                          >
                            {thread.resolved ? "Reopen" : "Resolve"}
                          </Text>
                        </Press>
                      ) : null}
                      <Press
                        feedback="scale"
                        accessibilityRole="button"
                        accessibilityLabel="More"
                        onPress={() => more(thread)}
                        style={[styles.round, { backgroundColor: quiet(palette) }]}
                      >
                        <SymbolView
                          name="ellipsis"
                          size={15}
                          weight="bold"
                          tintColor={palette.ink}
                        />
                      </Press>
                    </View>
                  </Card>
                </Animated.View>
              ))
            )}
          </ScrollView>
          {canEdit ? (
            <Animated.View
              style={[
                styles.composer,
                { borderColor: palette.rule, backgroundColor: palette.page },
                composerFoot,
              ]}
            >
              {suggestions.length ? (
                <ScrollView
                  horizontal
                  keyboardShouldPersistTaps="always"
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 8, paddingBottom: 10 }}
                >
                  {suggestions.map((member) => (
                    <Press
                      key={member.userId}
                      feedback="scale"
                      accessibilityRole="button"
                      accessibilityLabel={`Mention ${member.name}`}
                      onPress={() => mention(member)}
                      style={[styles.chip, styles.mentionChip, { backgroundColor: quiet(palette) }]}
                    >
                      <Avatar face={faceOf(member.userId)} size={22} />
                      <Text style={[styles.chipText, { color: palette.ink }]}>{member.name}</Text>
                    </Press>
                  ))}
                </ScrollView>
              ) : null}
              {replying ? (
                <View style={styles.context}>
                  <SymbolView
                    name="arrowshape.turn.up.left"
                    size={12}
                    weight="semibold"
                    tintColor={palette.ink3}
                  />
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
              {/* iMessage's shape: one pill, no face beside it — the sheet
                  is already yours — and the send button inside its corner. */}
              <View
                style={[
                  styles.pill,
                  { borderColor: palette.rule, backgroundColor: quiet(palette) },
                ]}
              >
                <TextInput
                  ref={input}
                  accessibilityLabel="Comment"
                  multiline
                  autoFocus={starting}
                  placeholder={
                    replying ? "Reply…" : starting ? "Say something about this…" : "Add a comment…"
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
            name={nameOf(held.comment.authorId)}
            face={faceOf(held.comment.authorId)}
            email={emailOf(held.comment.authorId)}
            members={members}
            counts={tally(reactions, held.comment.id, session.userId)}
            mine={held.comment.authorId === session.userId}
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
          />
        ) : null}
      </View>
    </Modal>
  );
}

function Quote({ text, palette }: { text: string; palette: Palette }) {
  return (
    <View style={styles.quote}>
      <View style={[styles.quoteBar, { backgroundColor: palette.ink4 }]} />
      <Text numberOfLines={3} style={[styles.quoteText, { color: palette.ink2 }]}>
        {text}
      </Text>
    </View>
  );
}

function EmptyThreads({ resolved, palette }: { resolved: boolean; palette: Palette }) {
  return (
    <Animated.View entering={FadeIn.duration(240)} style={styles.empty}>
      <View style={[styles.emptyDisc, { backgroundColor: quiet(palette) }]}>
        <SymbolView
          name={resolved ? "checkmark.bubble" : "bubble.left.and.bubble.right"}
          size={30}
          tintColor={palette.ink3}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: palette.ink }]}>
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
    opacity: 0.35 + 0.65 * on.value,
    transform: [{ scale: 0.86 + 0.14 * on.value }],
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
      <Animated.View
        style={[styles.send, { backgroundColor: ready ? palette.ink : palette.ink4 }, look]}
      >
        <SymbolView name="arrow.up" size={15} weight="bold" tintColor={palette.page} />
      </Animated.View>
    </Pressable>
  );
}

type Counts = ReturnType<typeof tally>;

function Message({
  comment,
  first,
  name,
  face,
  email,
  members,
  counts,
  lifted,
  canReact,
  onReact,
  onHold,
  palette,
}: {
  comment: NoteComment;
  first: boolean;
  name: string;
  face: Face;
  email?: string;
  members: Member[];
  counts: Counts;
  lifted: boolean;
  canReact: boolean;
  onReact: (emoji: string, on: boolean) => void;
  onHold: (target: ComponentRef<typeof View> | null) => void;
  palette: Palette;
}) {
  const box = useRef<ComponentRef<typeof View>>(null);
  const down = useSharedValue(0);
  const give = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.02 * down.value }],
    opacity: 1 - 0.08 * down.value,
  }));
  return (
    <Pressable
      accessibilityHint="Hold for reactions and more"
      delayLongPress={300}
      onPressIn={() => {
        down.value = withTiming(1, { duration: 300 });
      }}
      onPressOut={() => {
        down.value = withSpring(0, release);
      }}
      onLongPress={() => onHold(box.current)}
    >
      <Animated.View
        ref={box}
        collapsable={false}
        style={[styles.message, { paddingTop: first ? 12 : 2, opacity: lifted ? 0 : 1 }, give]}
      >
        <View style={styles.faceColumn}>
          {first ? <Avatar face={face} email={email} size={32} /> : null}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          {first ? (
            <View style={styles.byline}>
              <Text numberOfLines={1} style={[styles.name, { color: palette.ink }]}>
                {name}
              </Text>
              <Text style={[styles.time, { color: palette.ink3 }]}>{ago(comment.createdAt)}</Text>
            </View>
          ) : null}
          <Words body={comment.body} members={members} palette={palette} />
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
                      backgroundColor: one.mine
                        ? palette.dark
                          ? "#ffffff2b"
                          : "#0000001a"
                        : quiet(palette),
                      borderColor: one.mine ? palette.ink3 : "transparent",
                    },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{one.emoji}</Text>
                  <Text
                    style={[styles.reactionCount, { color: one.mine ? palette.ink : palette.ink2 }]}
                  >
                    {one.count}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      </Animated.View>
    </Pressable>
  );
}

/** The long press: the remark lifted where it stood, the six reactions over
 *  it and its acts under it, the rest of the sheet dimmed behind. */
function HeldMenu({
  held,
  name,
  face,
  email,
  members,
  counts,
  mine,
  canEdit,
  open,
  palette,
  onClose,
  onReact,
  onReply,
  onEdit,
  onDelete,
}: {
  held: Held;
  name: string;
  face: Face;
  email?: string;
  members: Member[];
  counts: Counts;
  mine: boolean;
  canEdit: boolean;
  open: boolean;
  palette: Palette;
  onClose: () => void;
  onReact: (emoji: string, on: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
          <View style={[styles.tapbacks, { backgroundColor: palette.paper }]}>
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
        <View style={[styles.liftedCard, { backgroundColor: palette.paper }]}>
          <View style={styles.byline}>
            <Avatar face={face} email={email} size={24} />
            <Text numberOfLines={1} style={[styles.name, { color: palette.ink }]}>
              {name}
            </Text>
            <Text style={[styles.time, { color: palette.ink3 }]}>
              {ago(held.comment.createdAt)}
            </Text>
          </View>
          <Words body={held.comment.body} members={members} palette={palette} />
        </View>
        {acts.length ? (
          <View style={[styles.acts, { backgroundColor: palette.paper }]}>
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 8,
  },
  title: { fontSize: 28, fontWeight: "700", letterSpacing: -0.7 },
  count: { fontSize: 28, fontWeight: "600", letterSpacing: -0.7 },
  round: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  thread: { marginHorizontal: 16, marginBottom: 14 },
  hint: { fontSize: 13, fontWeight: "600", paddingHorizontal: 18, paddingBottom: 14 },
  quote: { flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 4 },
  quoteBar: { width: 3, borderRadius: 2 },
  quoteText: { flex: 1, fontSize: 15, lineHeight: 21, fontStyle: "italic" },
  message: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 6 },
  faceColumn: { width: 32 },
  byline: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  name: { fontSize: 15, fontWeight: "600", letterSpacing: -0.2, flexShrink: 1 },
  time: { fontSize: 13 },
  body: { fontSize: 16, lineHeight: 22 },
  reactions: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  reaction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 28,
    paddingHorizontal: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderCurve: "continuous",
  },
  reactionCount: { fontSize: 13, fontWeight: "600" },
  foot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingLeft: 7,
    paddingRight: 12,
    borderRadius: 17,
    borderCurve: "continuous",
  },
  chipText: { fontSize: 14, fontWeight: "600", letterSpacing: -0.2 },
  mentionChip: { height: 30, paddingLeft: 4, paddingRight: 11, borderRadius: 15 },
  composer: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  context: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  contextText: { flex: 1, fontSize: 13, fontWeight: "600" },
  pill: {
    flexDirection: "row",
    alignItems: "flex-end",
    minHeight: 38,
    borderRadius: 19,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 14,
    paddingRight: 3,
  },
  field: {
    flex: 1,
    fontSize: 16,
    minHeight: 36,
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 0,
    textAlignVertical: "top",
  },
  send: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginBottom: 3,
    marginLeft: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40, gap: 10 },
  emptyDisc: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 19, fontWeight: "600", letterSpacing: -0.3 },
  held: { position: "absolute", left: 16, right: 16, gap: 8 },
  tapbacks: {
    flexDirection: "row",
    alignSelf: "flex-start",
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
  liftedCard: { padding: 14, gap: 6, borderRadius: 20, borderCurve: "continuous" },
  acts: {
    alignSelf: "flex-start",
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
