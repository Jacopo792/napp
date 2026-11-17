/* The bubbles a chat message can be sent in — names and colours only.
 *
 * Pure, so `writingPreferences.ts` can validate a stored choice under
 * `node --experimental-strip-types`; the drawings are in `ChatBubble.tsx`.
 * The bubble is stamped on each message (`note_comments.bubble`), so a name
 * a client does not know falls back to the plain one rather than failing. */

export interface ChatBubbleStyle {
  id: string;
  name: string;
  /** The body, and the words on it. `null` is the app's own: the accent for
   *  what you send, the column's paper for what others do. */
  fill: string | null;
  ink: string | null;
  /** A hairline for bodies too pale to hold an edge against the paper. */
  edge?: string;
}

export const CHAT_BUBBLES = [
  { id: "ink", name: "Ink", fill: null, ink: null },
  { id: "cat", name: "Cat", fill: "#fbe4cf", ink: "#4a2a17" },
  { id: "frog", name: "Frog", fill: "#b4e0a3", ink: "#1d3b17" },
  { id: "bunny", name: "Bunny", fill: "#ffffff", ink: "#3b3330", edge: "#e7e1d9" },
  { id: "bear", name: "Bear", fill: "#d7ac83", ink: "#36210f" },
  { id: "penguin", name: "Penguin", fill: "#d9edfa", ink: "#14324b" },
  { id: "fox", name: "Fox", fill: "#ffe7d4", ink: "#5a2a0e" },
  { id: "panda", name: "Panda", fill: "#ffffff", ink: "#26241f", edge: "#e7e1d9" },
  { id: "duck", name: "Duckling", fill: "#fff1a8", ink: "#4a3900" },
  { id: "axolotl", name: "Axolotl", fill: "#fcd0df", ink: "#5a1631" },
] as const satisfies readonly ChatBubbleStyle[];

export type ChatBubble = (typeof CHAT_BUBBLES)[number]["id"];

export function chatBubble(id: string | null | undefined): ChatBubbleStyle {
  return CHAT_BUBBLES.find((bubble) => bubble.id === id) ?? CHAT_BUBBLES[0];
}

/** The six offered first when reacting, until somebody chooses their own. */
export const DEFAULT_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "🎉"] as const;
