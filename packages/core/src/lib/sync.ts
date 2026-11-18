import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const TABLES = ["archives", "notes", "folders"] as const;
let nextSubscription = 0;

/** Realtime is a wake-up signal; the caller reloads a coherent snapshot. */
export function subscribeToArchive(archiveId: string, onChange: () => void): RealtimeChannel {
  const channel = supabase.channel(`archive:${archiveId}:${++nextSubscription}`);
  for (const table of TABLES) {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table,
        filter: `${table === "archives" ? "id" : "archive_id"}=eq.${archiveId}`,
      },
      onChange,
    );
  }
  /* Profiles have no archive_id: their SELECT policy already narrows delivery
     to people who share an archive. A change is only a wake-up signal, and the
     coherent reload fetches the roster and all of its profiles together. */
  channel.on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, onChange);
  return channel.subscribe();
}

/** Remarks, on a channel of their own.
 *
 *  Deliberately not folded into `TABLES` above: that subscription's caller
 *  reloads the whole archive snapshot, and it already fires on every save
 *  either member makes. A remark is rarer than a keystroke and needs a much
 *  cheaper answer, so it wakes the one reader that cares. */
export function subscribeToComments(archiveId: string, onChange: () => void): RealtimeChannel {
  /* Supabase reuses a channel with the same topic. The archive's remark
     counter and an open chat are independent readers: each must own its
     subscription, including while an older reader is still closing. */
  return supabase
    .channel(`remarks:${archiveId}:${++nextSubscription}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "note_comments",
        filter: `archive_id=eq.${archiveId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "note_comment_reactions",
        filter: `archive_id=eq.${archiveId}`,
      },
      onChange,
    )
    .subscribe();
}

/** The archive's general chat: its messages and their reactions. */
export function subscribeToArchiveChat(archiveId: string, onChange: () => void): RealtimeChannel {
  return supabase
    .channel(`general-chat:${archiveId}:${++nextSubscription}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "archive_messages",
        filter: `archive_id=eq.${archiveId}`,
      },
      onChange,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "archive_message_reactions",
        filter: `archive_id=eq.${archiveId}`,
      },
      onChange,
    )
    .subscribe();
}

/** Somebody is writing in a chat: `noteId` null is the general chat. */
export interface TypingEvent {
  userId: string;
  noteId: string | null;
  typing: boolean;
  bubble: string | null;
}
type TypingReader = (event: TypingEvent) => void;

/* Who is typing is said and forgotten: a broadcast, never a row, so it can
 * neither be stored nor read back as when somebody was last here. One
 * private topic per archive, which `realtime.messages` lets only its members
 * join (migration `chat_typing_channel`). Every open chat shares it: Supabase
 * hands back the same channel for the same topic, and one still closing
 * cannot be joined again, so it is counted here and left a moment before it
 * is closed. */
const typingRooms = new Map<
  string,
  { channel: RealtimeChannel; readers: Set<TypingReader>; joined: boolean; closing: number }
>();

export function joinTyping(
  archiveId: string,
  read: TypingReader,
): { say: (event: TypingEvent) => void; leave: () => void } {
  let room = typingRooms.get(archiveId);
  if (!room) {
    const channel = supabase.channel(`typing:${archiveId}`, { config: { private: true } });
    const made = { channel, readers: new Set<TypingReader>(), joined: false, closing: 0 };
    channel.on("broadcast", { event: "typing" }, ({ payload }) => {
      const event = payload as Partial<TypingEvent>;
      if (typeof event.userId !== "string") return;
      const said: TypingEvent = {
        userId: event.userId,
        noteId: typeof event.noteId === "string" ? event.noteId : null,
        typing: event.typing === true,
        bubble: typeof event.bubble === "string" ? event.bubble : null,
      };
      made.readers.forEach((reader) => reader(said));
    });
    channel.subscribe((status) => {
      made.joined = status === "SUBSCRIBED";
    });
    typingRooms.set(archiveId, (room = made));
  }
  const here = room;
  window.clearTimeout(here.closing);
  here.readers.add(read);
  return {
    /* Not before the join: an unjoined channel falls back to a REST post. */
    say: (event) => {
      if (here.joined)
        void here.channel.send({ type: "broadcast", event: "typing", payload: event });
    },
    leave: () => {
      here.readers.delete(read);
      if (here.readers.size) return;
      window.clearTimeout(here.closing);
      here.closing = window.setTimeout(() => {
        if (here.readers.size || typingRooms.get(archiveId) !== here) return;
        typingRooms.delete(archiveId);
        void supabase.removeChannel(here.channel);
      }, 5000);
    },
  };
}

export async function unsubscribeFromArchive(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}
