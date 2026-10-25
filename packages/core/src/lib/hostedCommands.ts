/* Data across an editor host's process boundary. No DOM or native imports. */
import type { JSONContent } from "@tiptap/core";
import type { FormatAction } from "../features/editor/components/RichTextEditor";

export type HostedCommand =
  | { type: "body" }
  | { type: "link"; url: string }
  | { type: "format"; action: FormatAction }
  | { type: "export"; format: "md" | "pdf" | "docx" }
  | { type: "restore"; body: HostedBody }
  | { type: "attach"; objectId: string; label: string; image: boolean }
  | { type: "comment"; threadId: string }
  /** Bring the passage to the middle of the page and light it, without the
   *  caret or the keyboard; waits for the note to arrive. True if found. */
  | { type: "revealComment"; threadId: string }
  /** The passage of every thread in the live document, by thread id. */
  | { type: "commentQuotes" }
  | { type: "resolveComment"; threadId: string; resolved: boolean }
  | { type: "removeComment"; threadId: string }
  | { type: "search"; query: string }
  | { type: "nextMatch" }
  | { type: "previousMatch" }
  | { type: "closeSearch" }
  | { type: "putDownPen" }
  /** A note just made: the caret in its title, the keyboard up. */
  | { type: "focusTitle" }
  /** The picture the phone's viewer shows: drawn over its place (hide it),
   *  closed (put it back),
   *  or one of the two edits the viewer offers on it. Answered by the page. */
  | { type: "image"; action: "shown" | "closed" | "markup" | "remove" }
  /** What a phone's keyboard bar asks for beyond `format`: the history, the
   *  underline the desktop has no button for, list depth, and putting the
   *  keyboard away. */
  | { type: "edit"; action: "undo" | "redo" | "underline" | "indent" | "outdent" | "done" };

/** What the selection is set in, for a host that draws the format bar. */
export interface HostedFormat {
  marks: ("bold" | "italic" | "underline" | "strike" | "code" | "link")[];
  block: "heading-1" | "heading-2" | "heading-3" | "quote" | "body";
  list: "bullet-list" | "ordered-list" | "checklist" | null;
  /** Words are chosen, not just a caret. */
  selection: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface HostedBody {
  title: string;
  content: JSONContent;
}
export interface HostedController {
  execute(command: HostedCommand): Promise<unknown>;
}
