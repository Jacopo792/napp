import type { JSONContent } from "@tiptap/core";
import { legacyMarkdownToRichText, richTextToMarkdown } from "./content.ts";

/* ── Markdown in and out ─────────────────────────────────────────────────────
   The whole of this app's interoperability, and deliberately the whole of it.

   Obsidian *is* a folder of Markdown files, so import and export of `.md` is
   not an approximation of an Obsidian integration — it is the integration.
   Notion and Google Docs both accept pasted Markdown, which is what "Copy as
   Markdown" is for. Apple Notes has no API at all. Every one of those is
   covered by a file and a clipboard, and none of them needs an OAuth client
   secret, a token store, or the server this project does not have.

   What does not survive the trip: an image or an attachment leaves as
   `napp-image:<id>`, because the bytes live in private Storage and a Markdown
   file cannot carry them. That reference is exactly what the importer reads
   back, so a note exported and re-imported here is whole; the same file opened
   in Obsidian shows a broken link where the picture was. Said plainly rather
   than hidden — carrying the images means downloading and writing every blob,
   which is a larger feature than this one. */

/** `# Title` first, because every other Markdown tool treats the first heading
 *  as the document's name and this app keeps the title in a column. */
export function noteToMarkdown(title: string, document: JSONContent): string {
  const body = richTextToMarkdown(document).trim();
  const heading = `# ${(title || "Untitled").replace(/\s+/g, " ").trim()}`;
  return body ? `${heading}\n\n${body}\n` : `${heading}\n`;
}

/** The inverse. A leading `# Heading` becomes the title, so a note that made
 *  the round trip comes back with the title it left with rather than with the
 *  heading duplicated in its first line. */
export function markdownToNote(
  fileName: string,
  markdown: string,
): { title: string; content: JSONContent } {
  /* A byte-order mark from an editor that writes one is not part of the text. */
  const text = markdown.replace(/^\uFEFF/, "");
  const heading = /^\s*#[ \t]+(.+?)[ \t]*(?:\n|$)/.exec(text);
  const fallback = fileName.replace(/\.[^.]+$/, "").trim();
  return {
    title: heading ? heading[1].trim() : fallback || "Untitled",
    content: legacyMarkdownToRichText(heading ? text.slice(heading[0].length) : text),
  };
}

/* Reserved on Windows, awkward on every shell, and a `/` would silently make a
   directory. Trimmed to a length a Finder column can still show. */
export function exportFileName(title: string): string {
  const cleaned = (title || "Untitled")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\p{Cc}/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[. ]+$/, "");
  return `${cleaned || "Untitled"}.md`;
}

/** Distinct names inside one export, so two notes called "Appunti" do not
 *  become one file. */
export function uniqueFileNames(titles: string[]): string[] {
  const used = new Set<string>();
  return titles.map((title) => {
    const name = exportFileName(title);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const stem = name.slice(0, -3);
    for (let n = 2; ; n += 1) {
      const candidate = `${stem} ${n}.md`;
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  });
}

export function downloadText(fileName: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  /* The click is synchronous but the fetch of the blob is not, so the URL
     cannot be revoked on the next line. */
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* A folder of `.md` files is what Obsidian calls a vault, so where the browser
   can write one the export writes exactly that. `showDirectoryPicker` is
   Chrome and Edge; Safari has no equivalent, and rather than sixty downloads
   in a row it falls back to one file with the notes separated by a rule. */
interface DirectoryHandle {
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
}

export type ExportShape = "folder" | "file";

export async function exportMarkdown(
  files: { name: string; text: string }[],
  fallbackName: string,
): Promise<ExportShape> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
    .showDirectoryPicker;

  if (typeof picker === "function") {
    const directory = await picker();
    for (const file of files) {
      const handle = await directory.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file.text);
      await writable.close();
    }
    return "folder";
  }

  downloadText(fallbackName, files.map((file) => file.text.trim()).join("\n\n---\n\n") + "\n");
  return "file";
}
