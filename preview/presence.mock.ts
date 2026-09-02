import type { AppSession } from "./session.mock";
import { PREVIEW_U2 } from "./fixture";

export type PreviewPresenceChannel = { timer: number };

/* The channel answers one question now — who is in the archive — so the
   stand-in is one set with the other member in it. Whether she is *writing* is
   a fact about the document, and `collab.mock.ts` is where that is pretended. */
export function subscribeToPresence(
  session: AppSession,
  onChange: (online: Set<string>) => void,
): PreviewPresenceChannel {
  const channel: PreviewPresenceChannel = { timer: 0 };
  channel.timer = window.setTimeout(() => onChange(new Set([session.userId, PREVIEW_U2])), 80);
  return channel;
}

export async function unsubscribeFromPresence(channel: PreviewPresenceChannel): Promise<void> {
  window.clearTimeout(channel.timer);
}
