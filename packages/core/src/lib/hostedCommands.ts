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
  | { type: "closeSearch" };

export interface HostedBody {
  title: string;
  content: JSONContent;
}
export interface HostedController {
  execute(command: HostedCommand): Promise<unknown>;
}
