import { chatListeners, typingListeners } from "./comments.mock";
/* Preview-only stand-in for src/lib/sync.ts. There is no server to listen to, so
   subscribing is inert and the caller simply never receives a wake-up. */
export type RealtimeChannel = { topic: string; stop?: () => void };

export function subscribeToArchive(archiveId: string, onChange: () => void): RealtimeChannel {
 const listener = (event: Event) => { if ((event as CustomEvent<string>).detail === archiveId) onChange(); };
 window.addEventListener("napp:preview-archive-changed", listener);
 return {topic: `archive:${archiveId}`, stop: () => window.removeEventListener("napp:preview-archive-changed", listener)};
}

export function subscribeToComments(archiveId: string, onChange: () => void): RealtimeChannel {
  chatListeners.add(onChange);
  return { topic: `remarks:${archiveId}`, stop: () => chatListeners.delete(onChange) };
}

export function subscribeToArchiveChat(archiveId: string, onChange: () => void): RealtimeChannel {
  chatListeners.add(onChange);
  return { topic: `general-chat:${archiveId}`, stop: () => chatListeners.delete(onChange) };
}

export interface TypingEvent {
  userId: string;
  noteId: string | null;
  typing: boolean;
  bubble: string | null;
}

export function joinTyping(_archiveId: string, read: (event: TypingEvent) => void) {
  typingListeners.add(read);
  return { say: (_event: TypingEvent) => {}, leave: () => void typingListeners.delete(read) };
}

export async function unsubscribeFromArchive(_channel: RealtimeChannel): Promise<void> {
  _channel.stop?.();
}
