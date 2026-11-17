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

export async function unsubscribeFromArchive(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}
