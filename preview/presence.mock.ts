import type { AppSession } from "./session.mock";
import { PREVIEW_U2 } from "./fixture";

export type PreviewPresenceChannel = { timer: number };

export function loadPresencePreference(): boolean {
  return false;
}

export function savePresencePreference(_session: AppSession, _enabled: boolean): void {
  /* The preview keeps the toggle in React state only, so every reload starts private. */
}

export function subscribeToPresence(
  session: AppSession,
  onChange: (onlineUserIds: Set<string>) => void,
): PreviewPresenceChannel {
  const timer = window.setTimeout(() => onChange(new Set([session.userId, PREVIEW_U2])), 80);
  return { timer };
}

export async function unsubscribeFromPresence(channel: PreviewPresenceChannel): Promise<void> {
  window.clearTimeout(channel.timer);
}
