/* Preview-only stand-in for src/lib/sync.ts. There is no server to listen to, so
   subscribing is inert and the caller simply never receives a wake-up. The
   window's events are optional calls because the phone has a `window` and no
   events on it. */
export type RealtimeChannel = { topic: string; stop?: () => void };

export function subscribeToArchive(archiveId: string, onChange: () => void): RealtimeChannel {
 const listener = (event: Event) => { if ((event as CustomEvent<string>).detail === archiveId) onChange(); };
 window.addEventListener?.("napp:preview-archive-changed", listener);
 return {topic: `archive:${archiveId}`, stop: () => window.removeEventListener?.("napp:preview-archive-changed", listener)};
}

export function subscribeToComments(archiveId: string, _onChange: () => void): RealtimeChannel {
  return { topic: `remarks:${archiveId}` };
}

export async function unsubscribeFromArchive(_channel: RealtimeChannel): Promise<void> {
  _channel.stop?.();
}
