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
  | { type: "revealComment"; threadId: string }
  | { type: "resolveComment"; threadId: string; resolved: boolean }
  | { type: "removeComment"; threadId: string }
  | { type: "search"; query: string }
  | { type: "nextMatch" }
  | { type: "previousMatch" }
  | { type: "closeSearch" }
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
