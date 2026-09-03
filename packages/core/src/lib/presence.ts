import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AppSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/* This channel answers one question: who is in the archive right now. It is
 * the dot on a face in the roster and nothing else.
 *
 * It used to answer two more — which note somebody had open, and whether they
 * were typing in it — and that was the whole of the trouble. Both of those are
 * facts about a *document*, and the document already has a place to keep them:
 * Yjs awareness, which every peer on the note is connected to by construction.
 * Asking a second, opt-in, archive-wide channel meant the face beside the title
 * and the "is she writing" glow came from different sources that were free to
 * disagree — and did, every time either member had this switch off.
 *
 * So `noteId` is gone (nothing ever read it back) and `typing` moved into
 * awareness beside the identity it belongs to. What is left is a set of ids.
 *
 * The preference that gates it is no longer kept here either: it is one field
 * in the account's profile row, in `accountPreferences.ts`, because a browser
 * is not who you are. */

/** A caller only joins this channel while broadcasting its own presence. That
 *  makes visibility symmetric: there is no listen-only mode in the client. */
export function subscribeToPresence(
  session: AppSession,
  onChange: (online: Set<string>) => void,
): RealtimeChannel {
  const channel = supabase.channel(`presence:${session.archiveId}`, {
    config: { presence: { key: session.userId }, private: true },
  });

  channel.on("presence", { event: "sync" }, () => {
    const online = new Set<string>();
    for (const presences of Object.values(channel.presenceState<{ userId?: string }>())) {
      for (const presence of presences) {
        if (typeof presence.userId === "string") online.add(presence.userId);
      }
    }
    onChange(online);
  });

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void channel.track({ userId: session.userId, onlineAt: new Date().toISOString() });
  });
  return channel;
}

export async function unsubscribeFromPresence(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await supabase.removeChannel(channel);
}
