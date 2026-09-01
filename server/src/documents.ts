/* Loading and saving one note's collaborative document.
 *
 * Everything here runs with the service role, which is the only key that
 * reaches `note_documents` at all — and it runs only after `access.ts` has
 * already decided, from the caller's own row level security, that this note is
 * theirs to open. The service role persists; it never authorises. */
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import {
  noteDocument,
  richTextToPlainText,
  withoutInvisibleDocumentEnding,
} from "../../src/features/editor/lib/content.ts";
import {
  DOCUMENT_FORMAT_VERSION,
  projectDocument,
  seedDocument,
} from "../../src/features/editor/lib/ydoc.ts";

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Fill `document` with the note as the archive holds it.
 *
 *  A note that has never been opened collaboratively has no binary yet, so one
 *  is built from the title and the Tiptap JSON already stored — and written
 *  straight away. Writing it now is what makes it the only seed there will ever
 *  be: a second seed built later would share no history with this one, and
 *  merging the two appends the whole body a second time.
 *
 *  Which is why the seed is built in a document of its own and never applied
 *  here. Two instances can open the same untouched note in the same instant —
 *  a deploy window is exactly that — and only one of them wins `on conflict do
 *  nothing`. Applying our own seed and *then* discovering we lost would be the
 *  duplication this is all arranged to prevent, so what gets applied is always
 *  what the archive ended up holding, ours or the other instance's.
 *
 *  Seeding deliberately does not touch `public.notes`. Opening a note is not
 *  editing it, and must not restamp it or move it up a list. */
export async function loadDocument(
  service: SupabaseClient,
  noteId: string,
  document: Y.Doc,
): Promise<void> {
  const stored = await readDocument(service, noteId);
  if (stored) {
    Y.applyUpdate(document, stored);
    return;
  }

  const note = await service
    .from("notes")
    .select("title, body, content, content_version, legacy_body")
    .eq("id", noteId)
    .maybeSingle();
  fail(note.error);
  if (!note.data) throw new Error("That note no longer exists");

  const seed = seedDocument(
    note.data.title ?? "",
    noteDocument(
      note.data.content,
      note.data.content_version,
      note.data.legacy_body ?? note.data.body ?? "",
    ),
  );

  const seeded = await service.rpc("seed_note_document", {
    target_note_id: noteId,
    document_state_base64: Buffer.from(Y.encodeStateAsUpdate(seed)).toString("base64"),
    document_format_version: DOCUMENT_FORMAT_VERSION,
  });
  fail(seeded.error);

  const settled = await readDocument(service, noteId);
  if (!settled) throw new Error("The document could not be created for this note");
  Y.applyUpdate(document, settled);
}

/** The stored binary, or `null` when this note has never been opened. */
async function readDocument(service: SupabaseClient, noteId: string): Promise<Uint8Array | null> {
  const stored = await service.rpc("load_note_document", { target_note_id: noteId });
  fail(stored.error);
  const row = (stored.data as { state_base64: string; format_version: number }[] | null)?.[0];
  return row ? Buffer.from(row.state_base64, "base64") : null;
}

/** One real edit. The binary and the projections every list, search, preview,
 *  export reads from it are written in the same transaction.
 *
 *  The projection is normalised first, and that is what decides whether the
 *  note counts as edited at all. `save_note_document` restamps `updated_at`
 *  only when a projection differs from the stored row, so an invisible
 *  difference is a visible one: type a word at the end of a note and delete it
 *  again and the editor leaves a trailing empty paragraph behind, which is a
 *  structurally different jsonb and used to move the note to the top of the
 *  list with nothing to show for it. Deleting text that was already there
 *  still changes the projection, and still counts — that is the whole
 *  distinction.
 *
 *  The binary is stored unnormalised, because it is the document's history and
 *  not a projection of it. */
export async function storeDocument(
  service: SupabaseClient,
  noteId: string,
  document: Y.Doc,
): Promise<void> {
  const projected = projectDocument(document);
  const content = withoutInvisibleDocumentEnding(projected.content);
  const saved = await service.rpc("save_note_document", {
    target_note_id: noteId,
    document_state_base64: Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64"),
    document_format_version: DOCUMENT_FORMAT_VERSION,
    projected_title: projected.title.trimEnd(),
    projected_body: richTextToPlainText(content),
    projected_content: content,
  });
  fail(saved.error);
}
