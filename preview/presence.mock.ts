import type { AppSession } from "./session.mock";
import { PREVIEW_U2 } from "./fixture";

export type PreviewPresenceChannel = { timer: number };
export type Presence = Map<string, string | null>;

/* Who is in the archive, and the note each has open. The other member sits on
   a note of her own — `n2` — so the list has a row to show her on that is not
   the one you open. Whether she is *writing* is a fact about the document, and
   `collab.mock.ts` is where that is pretended. */
export function subscribeToPresence(
  session: AppSession,
  onChange: (present: Presence) => void,
  noteId: () => string | null,
): PreviewPresenceChannel {
  const channel: PreviewPresenceChannel = { timer: 0 };
  channel.timer = window.setTimeout(
    () =>
      onChange(
        new Map([
          [session.userId, noteId()],
          [PREVIEW_U2, "n2"],
        ]),
      ),
    80,
  );
  return channel;
}

export async function announceNote(): Promise<void> {}

export async function unsubscribeFromPresence(channel: PreviewPresenceChannel): Promise<void> {
  window.clearTimeout(channel.timer);
}
