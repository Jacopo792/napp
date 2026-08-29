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

/** A caller only joins this channel while broadcasting its own presence. That
 *  makes visibility symmetric: there is no listen-only mode in the client. */
export function subscribeToPresence(
  session: AppSession,
  onChange: (onlineUserIds: Set<string>) => void,
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
