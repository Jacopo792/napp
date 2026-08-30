import type { AppSession } from "./session.mock";
import { PREVIEW_U2 } from "./fixture";

export interface PresenceMember {
  noteId: string | null;
  typing: boolean;
}

export type PreviewPresenceChannel = {
  emit: (members: Map<string, PresenceMember>) => void;
  timer: number;
  self: PresenceMember;
};

export function loadPresencePreference(): boolean {
  return false;
}

export function savePresencePreference(_session: AppSession, _enabled: boolean): void {
  /* The preview keeps the toggle in React state only, so every reload starts private. */
}

/* The stand-in puts the other member wherever this client is, and has them
   type in bursts, so the reader pill and its caret can be looked at with one
   browser and no archive. The real channel decides none of that — it only
   relays what each client says about itself. */
export function subscribeToPresence(
  session: AppSession,
  onChange: (members: Map<string, PresenceMember>) => void,
): PreviewPresenceChannel {
  const channel: PreviewPresenceChannel = {
    emit: onChange,
    timer: 0,
    self: { noteId: null, typing: false },
  };
  let typing = false;
  const beat = () => {
    typing = !typing;
    onChange(
      new Map([
        [session.userId, channel.self],
        [PREVIEW_U2, { noteId: channel.self.noteId, typing }],
      ]),
    );
  };
  window.setTimeout(beat, 80);
  channel.timer = window.setInterval(beat, 2600);
  return channel;
}

export function publishPresence(
  channel: PreviewPresenceChannel,
  _session: AppSession,
  activity: PresenceMember,
): void {
  channel.self = activity;
}

export async function unsubscribeFromPresence(channel: PreviewPresenceChannel): Promise<void> {
  window.clearInterval(channel.timer);
}
