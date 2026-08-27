import { decryptFile, decryptMeta } from "./crypto";
import { listNotesTree, readBlob, type TreeFile } from "./github";
import type { NoteEntry } from "./entries";
import type { AppSession } from "./session";
import type { Meta } from "./types";

/* ── Pulling the other device's writes ───────────────────────────────────────
   There is no backend to push from, so the branch is polled. Two properties
   make that cheap enough to do every few seconds:

   · One conditional request per poll. `notes/` is listed as a git tree, and
     GitHub answers 304 while the tree is byte-identical — and a 304 does not
     count against the REST rate limit. Nothing changed costs nothing.
   · Content is only read for blobs whose SHA moved. Editing one note pulls one
     note, however many are stored.

   Everything here is read-only; deciding what to do with a remote change is the
   caller's job, because only the caller knows what the user is typing. ─────── */

const META_FILE = /^meta-(u[12])\.napp$/;

/** What the tab already knows, so a pull can fetch only the difference. */
export interface SyncCursor {
  /** ETag of the last `notes/` listing, for the conditional request. */
  etag?: string;
  entries: NoteEntry[];
  /** Blob SHAs of the meta files, tracked by the caller across its own writes. */
  metaShas: { u1?: string; u2?: string };
  /**
   * Files this session holds no key for — a u2 login sees u1's notes. Remembered
   * by SHA so they are not re-downloaded and re-failed on every poll.
   */
  foreign: Record<string, string>;
}

export interface MetaUpdate {
  owner: "u1" | "u2";
  meta: Meta;
  sha: string;
}

export interface PullUpdate {
  changed: true;
  etag: string | undefined;
  /** The complete list after the pull: unchanged entries are reused as-is. */
  entries: NoteEntry[];
  /** Notes whose stored bytes moved — the ones an open editor may need. */
  updatedIds: string[];
  /** Notes deleted by the other device. */
  removedIds: string[];
  metas: MetaUpdate[];
  foreign: Record<string, string>;
}

export type PullResult = { changed: false } | PullUpdate;

export const EMPTY_CURSOR: SyncCursor = { entries: [], metaShas: {}, foreign: {} };

export async function pullRemote(session: AppSession, cursor: SyncCursor): Promise<PullResult> {
  const listing = await listNotesTree(session.repo, session.pat, cursor.etag);
  if (listing.unchanged) return { changed: false };

  const notes: TreeFile[] = [];
  const metas: { file: TreeFile; owner: "u1" | "u2" }[] = [];
  for (const file of listing.files) {
    const match = META_FILE.exec(file.name);
    if (match) metas.push({ file, owner: match[1] as "u1" | "u2" });
    else notes.push(file);
  }

  const known = new Map(cursor.entries.map((e) => [e.path, e]));
  const foreign: Record<string, string> = {};

  // ── Notes ────────────────────────────────────────────────────────────────
  const stale = notes.filter(
    (f) => known.get(f.path)?.sha !== f.sha && cursor.foreign[f.path] !== f.sha,
  );
  const loaded = await Promise.all(
    stale.map(async (file) => {
      const raw = await readBlob(session.repo, session.pat, file.sha);
      const note = await decryptFile(raw, session.keys);
      return note ? ({ note, sha: file.sha, path: file.path } satisfies NoteEntry) : file;
    }),
  );

  const updates = new Map<string, NoteEntry>();
  for (const result of loaded) {
    if ("note" in result) updates.set(result.path, result);
    else foreign[result.path] = result.sha;
  }
  // Files skipped on an earlier poll and still untouched stay skipped.
  for (const file of notes) {
    if (cursor.foreign[file.path] === file.sha) foreign[file.path] = file.sha;
  }

  const present = new Set(notes.map((f) => f.path));
  const entries: NoteEntry[] = [];
  const removedIds: string[] = [];
  for (const entry of cursor.entries) {
    if (!present.has(entry.path)) removedIds.push(entry.note.id);
    else entries.push(updates.get(entry.path) ?? entry);
  }
  for (const [path, entry] of updates) if (!known.has(path)) entries.push(entry);

  // ── Meta ─────────────────────────────────────────────────────────────────
  const metaUpdates: MetaUpdate[] = [];
  await Promise.all(
    metas.map(async ({ file, owner }) => {
      if (cursor.metaShas[owner] === file.sha) return;
      if (cursor.foreign[file.path] === file.sha) {
        foreign[file.path] = file.sha;
        return;
      }
      const raw = await readBlob(session.repo, session.pat, file.sha);
      const meta = await decryptMeta(raw, session.keys);
      if (meta) metaUpdates.push({ owner, meta, sha: file.sha });
      else foreign[file.path] = file.sha;
    }),
  );

  return {
    changed: true,
    etag: listing.etag,
    entries,
    updatedIds: [...updates.values()].map((e) => e.note.id),
    removedIds,
    metas: metaUpdates,
    foreign,
  };
}
