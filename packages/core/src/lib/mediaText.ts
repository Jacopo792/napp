import type { AppSession } from "./sessionRestore";
import { fail, supabase } from "./supabaseClient";

export async function loadMediaText(session: AppSession): Promise<Map<string, string>> {
  const result = await supabase
    .from("media_text")
    .select("object_id,text")
    .eq("archive_id", session.archiveId);
  fail(result.error);
  return new Map(
    (result.data ?? []).map((row: { object_id: string; text: string }) => [
      row.object_id,
      row.text,
    ]),
  );
}
export async function saveMediaText(
  session: AppSession,
  objectId: string,
  text: string,
): Promise<void> {
  const result = await supabase
    .from("media_text")
    .upsert({ archive_id: session.archiveId, object_id: objectId, text });
  fail(result.error);
}

export function subscribeMediaText(session: AppSession, changed: () => void): () => void {
  const channel = supabase
    .channel(`media-text:${session.archiveId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "media_text",
        filter: `archive_id=eq.${session.archiveId}`,
      },
      changed,
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
