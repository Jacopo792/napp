import { useCallback, useState } from "react";
import { Link, Stack, useFocusEffect } from "expo-router";
import { loadArchiveComments } from "@/lib/comments";
import { isForYou, threadsOf, unreadRemarks, type ArchiveComment } from "@/lib/commentThreads";
import { subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";
import { useArchive } from "../archive";
import { Group, Row } from "../Grouped";
import { Empty, SettingsPage, Status } from "../SettingsControls";
import { useToolbarIcon } from "../icons";

export default function Remarks() {
  const { session, snapshot, preferences, metaOf } = useArchive();
  const icon = useToolbarIcon();
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
  const ids = new Set(
    threads.map(
      (thread) => comments?.find((comment) => comment.threadId === thread.threadId)?.noteId,
    ),
  );
  const entries = (snapshot?.entries ?? []).filter(
    (entry) =>
      ids.has(entry.note.id) &&
      !metaOf(entry.note.ownerId ?? session.userId).notes.find((row) => row.id === entry.note.id)
        ?.trashedAt,
  );
  return (
    <SettingsPage title="Comments">
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={icon("person")}
          onPress={() => setOnlyMine((value) => !value)}
          accessibilityLabel={onlyMine ? "Show All Comments" : "Show Comments For You"}
        />
      </Stack.Toolbar>
      {error ? <Status>{error}</Status> : null}
      {entries.length ? (
        <Group title={onlyMine ? "For You" : "Open Conversations"}>
          {entries.map((entry) => (
            <Link
              key={entry.note.id}
              href={{ pathname: "/note/[id]", params: { id: entry.note.id, comments: "1" } }}
              asChild
            >
              <Row
                icon="bubble.left.and.bubble.right"
                label={entry.note.title || "Untitled"}
                detail={unread.has(entry.note.id) ? "New" : undefined}
              />
            </Link>
          ))}
        </Group>
      ) : (
        <Empty label={comments ? "No open comments" : "Loading…"} />
      )}
    </SettingsPage>
  );
}
