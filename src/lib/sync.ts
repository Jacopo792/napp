import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "./supabase";

const TABLES = ["archives", "notes", "folders", "tags", "note_tags"] as const;

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
  return channel.subscribe();
}

export async function unsubscribeFromArchive(channel: RealtimeChannel): Promise<void> {
  await supabase.removeChannel(channel);
}
