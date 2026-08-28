/* ── Attachments ─────────────────────────────────────────────────────────────
   A PDF dropped into a note is not prose, and turning it into prose was the old
   behaviour's mistake: the document stopped being a document. An attachment is
   now stored whole — encrypted in the browser, uploaded as opaque bytes, and
   referenced from the note by a single Markdown link whose target is a storage
   id rather than a URL:

     [Contract 2026.pdf](napp-file:8f14e45f-…)

   The editor renders that link as a card. Opening it decrypts the bytes here
   and hands the browser a blob in a new tab; nothing about the file ever
   reaches the server in a readable form. ─────────────────────────────────── */

/** The bucket refuses anything larger, and ciphertext adds 28 bytes. */
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
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
};

/** What to tell the browser the decrypted bytes are, inferred from the label. */
export function attachmentType(label: string): string {
  const extension = label.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  return TYPES[extension] ?? "application/octet-stream";
}

export function attachmentExtension(label: string): string {
  return (label.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "file").toUpperCase();
}

/** Square brackets would end the link label early, so they never survive. */
export function attachmentLabel(filename: string): string {
  return filename.replace(/[[\]]/g, "").trim() || "Attachment";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function assertAttachable(file: File): void {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a PDF file");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`PDFs must be smaller than ${formatBytes(MAX_ATTACHMENT_BYTES)}`);
  }
}
