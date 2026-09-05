/* ── Attachments ─────────────────────────────────────────────────────────────
   A PDF dropped into a note is not prose, and turning it into prose was the old
   behaviour's mistake: the document stopped being a document. An attachment is
   now stored whole in the private archive bucket and referenced from the note
   by a structured private-file node whose only payload is the storage id and
   display label. Legacy Markdown links are converted at the import boundary.

   The editor renders the node as a card. Opening it downloads the bytes here
   and hands the browser a blob in a new tab. The private bucket is protected by
   the same archive-membership policy as the notes. ────────────────────────── */

/** Keep large attachments out of the note-writing path. */
export const MAX_ATTACHMENT_BYTES = 24 * 1024 * 1024;

const REFERENCE =
  /^napp-file:([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

export function attachmentReference(objectId: string): string {
  return `napp-file:${objectId}`;
}

/** The storage id behind a reference, or null when the URL is an ordinary one. */
export function attachmentObjectId(url: string): string | null {
  return REFERENCE.exec(url.trim())?.[1] ?? null;
}

const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
};

/** What to tell the browser the downloaded bytes are, inferred from the label. */
export function attachmentType(label: string): string {
  const extension = label.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return TYPES[extension] ?? "application/octet-stream";
}

export function attachmentExtension(label: string): string {
  return (label.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "file").toUpperCase();
}

/** Keep the visible label clean and compatible with legacy Markdown imports. */
export function attachmentLabel(filename: string): string {
  return filename.replace(/[[\]]/g, "").trim() || "Attachment";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertAttachable(file: File): void {
  if (
    !["application/pdf", "video/mp4", "video/webm", "video/quicktime"].includes(
      attachmentType(file.name),
    )
  ) {
    throw new Error("Choose a PDF, MP4, WebM or MOV file");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`Attachments must be smaller than ${formatBytes(MAX_ATTACHMENT_BYTES)}`);
  }
}
