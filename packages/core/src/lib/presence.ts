import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AppSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

/* This channel answers who is in the archive right now and, since the note
 * list started showing it, which note each of them has open.
 *
 * It answered the second question once before and gave it up, because the
 * face beside the title and the "is she writing" glow then came from two
 * sources free to disagree. That stays true of everything *inside* a note:
 * the face, the caret and typing are Yjs awareness and nothing here feeds
 * them. What comes back is narrower — a dot on a row in the list, for a note
 * you do not have open and are therefore not connected to — and it is the one
 * thing awareness cannot say, because awareness exists only on the documents
 * you have open.
 *
 * The preference that gates it is one field in the account's profile row, in
 * `accountPreferences.ts`, because a browser is not who you are. */

/** Who is here, and the note each has open (`null` for none). */
export type Presence = Map<string, string | null>;

type Payload = { userId?: string; noteId?: string | null };

/** A caller only joins this channel while broadcasting its own presence. That
 *  makes visibility symmetric: there is no listen-only mode in the client. */
export function subscribeToPresence(
  session: AppSession,
  onChange: (present: Presence) => void,
  noteId: () => string | null,
): RealtimeChannel {
  const channel = supabase.channel(`presence:${session.archiveId}`, {
    config: { presence: { key: session.userId }, private: true },
  });

  channel.on("presence", { event: "sync" }, () => {
    const present: Presence = new Map();
    for (const presences of Object.values(channel.presenceState<Payload>())) {
      for (const presence of presences) {
        if (typeof presence.userId !== "string") continue;
        const note = typeof presence.noteId === "string" ? presence.noteId : null;
        // Two tabs of one account: a note open in either one counts.
        if (!present.get(presence.userId)) present.set(presence.userId, note);
      }
    }
    onChange(present);
  });

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void announceNote(channel, session, noteId());
  });
  return channel;
}

/** Say which note this tab has open. Re-tracking replaces the payload. */
export async function announceNote(
  channel: RealtimeChannel,
  session: AppSession,
  noteId: string | null,
): Promise<void> {
  await channel.track({ userId: session.userId, onlineAt: new Date().toISOString(), noteId });
}

export async function unsubscribeFromPresence(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await supabase.removeChannel(channel);
}
