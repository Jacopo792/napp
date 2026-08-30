import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AppSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";

const KEY_PREFIX = "napp:presence";

function preferenceKey(session: AppSession): string {
  return `${KEY_PREFIX}:${session.userId}:${session.archiveId}`;
}

export function loadPresencePreference(session: AppSession): boolean {
  try {
    return localStorage.getItem(preferenceKey(session)) === "on";
  } catch {
    return false;
  }
}

export function savePresencePreference(session: AppSession, enabled: boolean): void {
  try {
    localStorage.setItem(preferenceKey(session), enabled ? "on" : "off");
  } catch {
    /* Presence is optional and stays off when local preferences are unavailable. */
  }
}

/** What one member is doing, as far as the channel knows. `noteId` is the note
 *  they have open; `typing` is a flag they raise and lower themselves.
 *
 *  A flag rather than a timestamp, deliberately. A timestamp means every
 *  reader needs a clock, an expiry and a re-render tick to notice it lapse —
 *  three moving parts for something the writer already knows. The writer sends
 *  `true` on the first keystroke and `false` when they stop, and a reader only
 *  ever reads what it was told. */
export interface PresenceMember {
  noteId: string | null;
  typing: boolean;
}

interface PresencePayload extends Partial<PresenceMember> {
  userId?: string;
}

/** A caller only joins this channel while broadcasting its own presence. That
 *  makes visibility symmetric: there is no listen-only mode in the client. */
export function subscribeToPresence(
  session: AppSession,
  onChange: (members: Map<string, PresenceMember>) => void,
): RealtimeChannel {
  const channel = supabase.channel(`presence:${session.archiveId}`, {
    config: { presence: { key: session.userId }, private: true },
  });

  channel.on("presence", { event: "sync" }, () => {
    const online = new Map<string, PresenceMember>();
    for (const presences of Object.values(channel.presenceState<PresencePayload>())) {
      for (const presence of presences) {
        if (typeof presence.userId !== "string") continue;
        online.set(presence.userId, {
          noteId: typeof presence.noteId === "string" ? presence.noteId : null,
          typing: presence.typing === true,
        });
      }
    }
    onChange(online);
  });

  channel.subscribe((status) => {
    if (status !== "SUBSCRIBED") return;
    void channel.track(payload(session, { noteId: null, typing: false }));
  });
  return channel;
}

/** Presence is one payload, not a set of fields, so the note and the typing
 *  flag are re-announced together every time either of them moves. */
export function publishPresence(
  channel: RealtimeChannel,
  session: AppSession,
  activity: PresenceMember,
): void {
  void channel.track(payload(session, activity));
}

function payload(session: AppSession, activity: PresenceMember): PresencePayload {
  return {
    userId: session.userId,
    onlineAt: new Date().toISOString(),
    ...activity,
  } as PresencePayload;
}

export async function unsubscribeFromPresence(channel: RealtimeChannel): Promise<void> {
  await channel.untrack();
  await supabase.removeChannel(channel);
}
