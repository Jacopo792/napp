/* Loading and saving one note's collaborative document.
 *
 * Everything here runs with the service role, which is the only key that
 * reaches `note_documents` at all — and it runs only after `access.ts` has
 * already decided, from the caller's own row level security, that this note is
 * theirs to open. The service role persists; it never authorises. */
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import { noteDocument, richTextToPlainText } from "../../src/features/editor/lib/content.ts";
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
 *  Seeding deliberately does not touch `public.notes`. Opening a note is not
 *  editing it, and must not restamp it or move it up a list. */
export async function loadDocument(
  service: SupabaseClient,
  noteId: string,
  document: Y.Doc,
): Promise<void> {
  const stored = await service.rpc("load_note_document", { target_note_id: noteId });
  fail(stored.error);

  const row = (stored.data as { state_base64: string; format_version: number }[] | null)?.[0];
  if (row) {
    Y.applyUpdate(document, Buffer.from(row.state_base64, "base64"));
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
  const state = Y.encodeStateAsUpdate(seed);
  Y.applyUpdate(document, state);

  const seeded = await service.rpc("seed_note_document", {
    target_note_id: noteId,
    document_state_base64: Buffer.from(state).toString("base64"),
    document_format_version: DOCUMENT_FORMAT_VERSION,
  });
  fail(seeded.error);
  // ponytail: one instance, and Hocuspocus builds a document name once, so
  // losing this race is impossible today. If a second instance is ever added,
  // this has to become "discard the seed and re-read", not "carry on".
  if (seeded.data === false) {
    throw new Error("This note was seeded by another instance; reconnect to pick it up");
  }
}

/** One real edit. The binary and the projections every list, search, preview,
 *  export and template read from it are written in the same transaction. */
export async function storeDocument(
  service: SupabaseClient,
  noteId: string,
  document: Y.Doc,
): Promise<void> {
  const { title, content } = projectDocument(document);
  const saved = await service.rpc("save_note_document", {
    target_note_id: noteId,
    document_state_base64: Buffer.from(Y.encodeStateAsUpdate(document)).toString("base64"),
    document_format_version: DOCUMENT_FORMAT_VERSION,
    projected_title: title,
    projected_body: richTextToPlainText(content),
    projected_content: content,
  });
  fail(saved.error);
}
