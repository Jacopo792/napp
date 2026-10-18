/* Every conversation still open, one row a note, as Revolut lists who paid
 * whom: the face of whoever spoke last, the note's name, what they said, when
 * — and the dot when it is new to you. The chips choose between everything
 * open and what is yours to deal with. */
import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { loadArchiveComments } from "@/lib/comments";
import { isForYou, threadsOf, unreadRemarks, type ArchiveComment } from "@/lib/commentThreads";
import { formatStamp } from "@/lib/format";
import { subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import { useArchive, usePalette } from "../../archive";
import { Avatar } from "../../Avatar";
import { NoteLink } from "../../NoteLink";
import { Empty, Status } from "../../SettingsControls";
import { Card, Chips, Reveal, SkeletonCard, TabPage } from "../../Chrome";

export default function Remarks() {
  const { session, snapshot, preferences, metaOf } = useArchive();
  const palette = usePalette();
  const [comments, setComments] = useState<ArchiveComment[] | null>(null);
  const [error, setError] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      let revision = 0;
      const refresh = () => {
        const request = ++revision;
        void loadArchiveComments(session).then(
          (list) => {
            if (live && revision === request) {
              setComments(list);
              setError("");
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
    }, [session]),
  );
  const unread = new Set(
    unreadRemarks(comments ?? [], session.userId, preferences.remarksSeen).map(
      (comment) => comment.noteId,
    ),
  );
  const threads = threadsOf(
    [...(comments ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  ).filter((thread) => !thread.resolved && (!onlyMine || isForYou(thread, session.userId)));
  /* The last word said in an open thread, per note. */
  const latest = new Map<string, ArchiveComment>();
  for (const thread of threads)
    for (const said of thread.comments as ArchiveComment[]) {
      const before = latest.get(said.noteId);
      if (!before || before.createdAt < said.createdAt) latest.set(said.noteId, said);
    }
  const entries = (snapshot?.entries ?? [])
    .filter(
      (entry) =>
        latest.has(entry.note.id) &&
        !metaOf(entry.note.ownerId ?? session.userId).notes.find((row) => row.id === entry.note.id)
          ?.trashedAt,
    )
    .sort((a, b) =>
      latest.get(b.note.id)!.createdAt.localeCompare(latest.get(a.note.id)!.createdAt),
    );
  const memberOf = (userId: string) => snapshot?.members.find((member) => member.userId === userId);
  return (
    <TabPage>
      <Chips
        items={[
          {
            id: "all",
            label: "Open",
            icon: "bubble.left.and.bubble.right",
            on: !onlyMine,
            onPress: () => setOnlyMine(false),
          },
          {
            id: "mine",
            label: "For You",
            icon: "person",
            on: onlyMine,
            onPress: () => setOnlyMine(true),
          },
        ]}
      />
      {error ? <Status>{error}</Status> : null}
      {!comments ? (
        <SkeletonCard rows={5} />
      ) : entries.length ? (
        <Reveal>
          <Card style={styles.card}>
            {entries.map((entry) => {
              const said = latest.get(entry.note.id)!;
              const author = memberOf(said.authorId);
              return (
                <NoteLink key={entry.note.id} entry={entry} comments style={styles.row}>
                  <Avatar
                    face={{
                      userId: said.authorId,
                      name: author?.nickname || "Member",
                      avatarObject: author?.avatarObject ?? null,
                    }}
                    email={said.authorId === session.userId ? session.email : undefined}
                    size={44}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.title, { color: palette.ink }]} numberOfLines={1}>
                      {entry.note.title || "Untitled"}
                    </Text>
                    <Text style={{ color: palette.ink3, fontSize: 14 }} numberOfLines={1}>
                      {said.body}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 6, alignSelf: "flex-start" }}>
                    <Text style={{ color: palette.ink3, fontSize: 12 }}>
                      {formatStamp(said.createdAt)}
                    </Text>
                    {unread.has(entry.note.id) ? (
                      <View
                        accessibilityLabel="New"
                        style={[styles.dot, { backgroundColor: palette.accent }]}
                      />
                    ) : null}
                  </View>
                </NoteLink>
              );
            })}
          </Card>
        </Reveal>
      ) : (
        <Empty label={onlyMine ? "Nothing for you" : "No open comments"} />
      )}
    </TabPage>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, paddingVertical: 6 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  title: { fontSize: 16, fontWeight: "600", letterSpacing: -0.2 },
  dot: { width: 9, height: 9, borderRadius: 5 },
});
