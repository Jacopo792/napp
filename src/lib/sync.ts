import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const TABLES = ["archives", "notes", "folders", "tags", "note_tags", "note_templates"] as const;

/** Realtime is a wake-up signal; the caller reloads a coherent snapshot. */
export function subscribeToArchive(archiveId: string, onChange: () => void): RealtimeChannel {
  const channel = supabase.channel(`archive:${archiveId}`);
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

export async function unsubscribeFromArchive(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}
