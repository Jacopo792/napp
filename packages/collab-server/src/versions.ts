/* A version is a stretch of somebody's writing.
 *
 * Every update this process applies on behalf of a connection is an update it
 * authorised, so it knows whose it was — which is the one fact the Yjs binary
 * keeps no readable record of. `touched` collects those names per note; a
 * version is written when the stretch has run ten minutes or the note is
 * closed, whichever comes first, and carries everyone who wrote in it.
 *
 * Only updates that arrived over a connection count. One relayed from another
 * instance through Redis has no connection here, and is that instance's to
 * record — so two instances serving the same note write a version each for
 * their own writers rather than two for both.
 *
 * A failure is logged and dropped. A version is a convenience laid over a
 * document that has already been saved; it must never be the reason a save
 * fails. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type * as Y from "yjs";
import {
  richTextToPlainText,
  withoutInvisibleDocumentEnding,
} from "@notes-app/core/editor/content.ts";
import { textChanges, wordTally } from "@notes-app/core/editor/versionDiff.ts";
import { projectDocument } from "@notes-app/core/editor/ydoc.ts";

const STRETCH_MS = 10 * 60_000;

interface Stretch {
  archiveId: string;
  authors: Set<string>;
  since: number;
}

function snapshot(document: Y.Doc) {
  const projected = projectDocument(document);
  const content = withoutInvisibleDocumentEnding(projected.content);
  const title = projected.title.trimEnd();
  return { title, content, text: `${title}\n${richTextToPlainText(content)}` };
}

export function versionKeeper(service: SupabaseClient, stretchMs = STRETCH_MS) {
  const stretches = new Map<string, Stretch>();
  /* What the note said when the current stretch began — the far side of the
     "+12 −3" on the version that ends it. Taken when the note is loaded and
     again at every version, so it costs no query. */
  const baselines = new Map<string, string>();

  async function write(noteId: string, stretch: Stretch, document: Y.Doc): Promise<void> {
    const now = snapshot(document);
    const before = baselines.get(noteId);
    baselines.set(noteId, now.text);
    if (before === now.text) return;
    const tally = before === undefined ? null : wordTally(textChanges(before, now.text));
    const result = await service.from("note_versions").insert({
      archive_id: stretch.archiveId,
      note_id: noteId,
      author_ids: [...stretch.authors],
      title: now.title,
      content: now.content,
      words_added: tally?.added ?? null,
      words_removed: tally?.removed ?? null,
    });
    if (result.error) console.error(`version of ${noteId} not written: ${result.error.message}`);
  }

  return {
    loaded(noteId: string, document: Y.Doc): void {
      baselines.set(noteId, snapshot(document).text);
    },

    touched(noteId: string, archiveId: string, userId: string): void {
      const stretch = stretches.get(noteId);
      if (stretch) stretch.authors.add(userId);
      else stretches.set(noteId, { archiveId, authors: new Set([userId]), since: Date.now() });
    },

    /** After a save. `closing` is the note leaving memory: whatever stretch
     *  is open ends there, however short. */
    async settle(noteId: string, document: Y.Doc, closing = false): Promise<void> {
      const stretch = stretches.get(noteId);
      if (!stretch) {
        if (closing) baselines.delete(noteId);
        return;
      }
      if (!closing && Date.now() - stretch.since < stretchMs) return;
      stretches.delete(noteId);
      try {
        await write(noteId, stretch, document);
      } catch (error) {
        console.error(`version of ${noteId} not written:`, error);
      } finally {
        if (closing) baselines.delete(noteId);
      }
    },
  };
}
