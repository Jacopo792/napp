import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
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
  mentionedIn,
  REACTIONS,
  tally,
  threadsOf,
  type NoteComment,
  type Reaction,
} from "@/lib/commentThreads";
import { subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import type { HostedCommand } from "@/lib/hostedCommands";
import { Group, Row } from "./Grouped";
import { NoteSheet } from "./NoteSheet";
import { attempt, Empty, Status } from "./SettingsControls";
import { useArchive, usePalette } from "./archive";
import { useTextPrompt } from "./TextPrompt";

type Execute = <T = unknown>(command: HostedCommand) => Promise<T>;
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
  const prompt = useTextPrompt();
  const [comments, setComments] = useState<NoteComment[] | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [anchorSaved, setAnchorSaved] = useState(false);
  const members = (snapshot?.members ?? []).map((member) => ({
    userId: member.userId,
    name: member.nickname || (member.isSelf ? "You" : "Member"),
  }));
  const nameOf = (id: string) =>
    id === session.userId ? "You" : members.find((m) => m.userId === id)?.name || "Former Member";
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
  }, [load, session.archiveId, noteId, updatePreferences]);
  const refresh = async () => {
    const { rows, answers } = await load();
    setComments(rows);
    setReactions(answers);
  };
  const threads = threadsOf(comments ?? []);
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
        const threadId = reply ?? (anchor && !anchorSaved ? anchor.threadId : randomUUID());
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
      }),
    );
  return (
    <NoteSheet
      title="Comments"
      onClose={close}
      footer={
        canEdit ? (
          <View style={{ gap: 10 }}>
            {reply ? (
              <Pressable onPress={() => setReply(null)}>
                <Text style={{ color: palette.accent }}>Replying · Cancel</Text>
              </Pressable>
            ) : anchor && !anchorSaved ? (
              <Text style={{ color: palette.ink3 }} numberOfLines={3}>
                “{anchor.quote}”
              </Text>
            ) : null}
            <TextInput
              accessibilityLabel="Comment"
              multiline
              placeholder="Add a comment…"
              placeholderTextColor={palette.ink3}
              value={draft}
              onChangeText={setDraft}
              style={{ color: palette.ink, fontSize: 17, minHeight: 44, maxHeight: 140 }}
            />
            <View style={{ flexDirection: "row", gap: 12, justifyContent: "flex-end" }}>
              <Pressable disabled={busy || !draft.trim()} onPress={send}>
                <Text
                  style={{
                    color: busy || !draft.trim() ? palette.ink4 : palette.accent,
                    fontSize: 17,
                    fontWeight: "600",
                  }}
                >
                  {busy ? "Sending…" : "Send"}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null
      }
    >
      {error ? <Status>{error}</Status> : null}
      <Group>
        <Row
          icon="checkmark"
          label={showResolved ? "Hide Resolved" : "Show Resolved"}
          chevron={false}
          onPress={() => setShowResolved((v) => !v)}
        />
      </Group>
      {!comments ? (
        <Empty label="Loading…" />
      ) : !threads.some((thread) => showResolved || !thread.resolved) ? (
        <Empty label="No comments" />
      ) : null}
      {threads
        .filter((thread) => showResolved || !thread.resolved)
        .map((thread) => (
          <View
            key={thread.threadId}
            style={{
              marginHorizontal: 16,
              marginBottom: 20,
              borderRadius: 24,
              backgroundColor: palette.paper,
              overflow: "hidden",
            }}
          >
            {thread.comments.map((comment) => (
              <View
                key={comment.id}
                style={{ padding: 18, gap: 10, borderBottomWidth: 0.5, borderColor: palette.rule }}
              >
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Text style={{ flex: 1, color: palette.ink, fontWeight: "600", fontSize: 16 }}>
                    {nameOf(comment.authorId)}
                  </Text>
                  <Text style={{ color: palette.ink3, fontSize: 12 }}>
                    {new Date(comment.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Text selectable style={{ color: palette.ink, fontSize: 17, lineHeight: 25 }}>
                  {comment.body}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                  {REACTIONS.map((emoji) => {
                    const count = tally(reactions, comment.id, session.userId).find(
                      (one) => one.emoji === emoji,
                    );
                    return (
                      <Pressable
                        key={emoji}
                        accessibilityLabel={`${emoji}${count?.mine ? ", remove reaction" : ", react"}`}
                        disabled={!canEdit || busy}
                        onPress={() =>
                          void attempt(() =>
                            action(() =>
                              setReaction(session, noteId, comment.id, emoji, !count?.mine),
                            ),
                          )
                        }
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            backgroundColor: count?.mine ? palette.surface : undefined,
                            borderRadius: 8,
                            padding: 3,
                          }}
                        >
                          {emoji}
                          {count?.count ? ` ${count.count}` : ""}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {canEdit && comment.authorId === session.userId ? (
                  <View style={{ flexDirection: "row", gap: 20 }}>
                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        prompt(
                          "Edit Comment",
                          undefined,
                          (body) =>
                            void attempt(() =>
                              action(() =>
                                updateComment(
                                  session,
                                  comment.id,
                                  body,
                                  mentionedIn(body, members),
                                ),
                              ),
                            ),
                          "plain-text",
                          comment.body,
                        )
                      }
                    >
                      <Text style={{ color: palette.accent }}>Edit</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() =>
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
                                    await execute({
                                      type: "removeComment",
                                      threadId: thread.threadId,
                                    });
                                }),
                              ),
                          },
                        ])
                      }
                    >
                      <Text style={{ color: palette.danger }}>Delete</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ))}
            <View style={{ padding: 18, gap: 14 }}>
              <Pressable
                onPress={() => {
                  void attempt(async () => {
                    const found = await execute<boolean>({
                      type: "revealComment",
                      threadId: thread.threadId,
                    });
                    if (found) close();
                    else Alert.alert("This comment has no passage in the current text");
                  });
                }}
              >
                <Text style={{ color: palette.accent }}>Show Passage</Text>
              </Pressable>
              {thread.assigneeId ? (
                <Text style={{ color: palette.ink3 }}>Assigned to {nameOf(thread.assigneeId)}</Text>
              ) : null}
              {canEdit ? (
                <>
                  <View style={{ flexDirection: "row", gap: 20, flexWrap: "wrap" }}>
                    {!thread.resolved ? (
                      <Pressable disabled={busy} onPress={() => setReply(thread.threadId)}>
                        <Text style={{ color: palette.accent }}>Reply</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        setAssigning(assigning === thread.threadId ? null : thread.threadId)
                      }
                    >
                      <Text style={{ color: palette.accent }}>Assign</Text>
                    </Pressable>
                    <Pressable
                      disabled={busy}
                      onPress={() =>
                        void attempt(() =>
                          action(async () => {
                            await resolveThread(session, noteId, thread.threadId, !thread.resolved);
                            await execute({
                              type: "resolveComment",
                              threadId: thread.threadId,
                              resolved: !thread.resolved,
                            });
                          }),
                        )
                      }
                    >
                      <Text style={{ color: palette.accent }}>
                        {thread.resolved ? "Reopen" : "Resolve"}
                      </Text>
                    </Pressable>
                  </View>
                  {assigning === thread.threadId
                    ? [{ userId: "", name: "Nobody" }, ...members].map((member) => (
                        <Pressable
                          key={member.userId}
                          disabled={busy}
                          onPress={() =>
                            void attempt(() =>
                              action(async () => {
                                await assignThread(
                                  session,
                                  noteId,
                                  thread.threadId,
                                  member.userId || null,
                                );
                                setAssigning(null);
                              }),
                            )
                          }
                        >
                          <Text style={{ color: palette.accent }}>{member.name}</Text>
                        </Pressable>
                      ))
                    : null}
                </>
              ) : null}
            </View>
          </View>
        ))}
    </NoteSheet>
  );
}
