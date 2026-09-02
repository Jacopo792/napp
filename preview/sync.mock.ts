/* Preview-only stand-in for src/lib/sync.ts. There is no server to listen to, so
   subscribing is inert and the caller simply never receives a wake-up. */
export type RealtimeChannel = { topic: string };

export function subscribeToArchive(archiveId: string, _onChange: () => void): RealtimeChannel {
  return { topic: `archive:${archiveId}` };
}

export function subscribeToComments(archiveId: string, _onChange: () => void): RealtimeChannel {
  return { topic: `remarks:${archiveId}` };
}

export async function unsubscribeFromArchive(_channel: RealtimeChannel): Promise<void> {
  /* Nothing was subscribed. */
}
