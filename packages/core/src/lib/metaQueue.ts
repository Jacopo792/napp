/* Metadata waiting to be written, one entry per owner's scope.

   An entry is the scope as Postgres last had it (`before`) and as it should
   become (`after`); `persistMetaDiff` writes the difference. Staging again
   keeps the first `before`, so a burst of changes is one diff. A write that
   fails goes back with its own `before` and the newest `after`, so nothing
   staged meanwhile is lost and nothing is written twice.

   Pure, so `node --experimental-strip-types` can test it. */
import { ALL, ARCHIVE, TRASH } from "./scopes.ts";
import type { Meta } from "./types.ts";

export interface PendingMeta {
  before: Meta;
  after: Meta;
}

export class MetaQueue {
  private pending = new Map<string, PendingMeta>();

  get size(): number {
    return this.pending.size;
  }

  has(owner: string): boolean {
    return this.pending.has(owner);
  }

  get(owner: string): PendingMeta | undefined {
    return this.pending.get(owner);
  }

  owners(): string[] {
    return [...this.pending.keys()];
  }

  discard(owner: string): void {
    this.pending.delete(owner);
  }

  /** `base` is what the scope is now, used only if nothing is waiting yet. */
  stage(owner: string, base: Meta, after: Meta): void {
    this.pending.set(owner, { before: this.pending.get(owner)?.before ?? base, after });
  }

  /** Takes the owner's entry *as it is now* and writes it. On failure the
   *  entry goes back, merged with anything staged while the write was out,
   *  and the error is thrown on. */
  async flush(owner: string, write: (before: Meta, after: Meta) => Promise<void>): Promise<void> {
    const taken = this.pending.get(owner);
    if (!taken) return;
    this.pending.delete(owner);
    try {
      await write(taken.before, taken.after);
    } catch (err) {
      const newer = this.pending.get(owner);
      this.pending.set(owner, { before: taken.before, after: newer?.after ?? taken.after });
      throw err;
    }
  }

  /** Every owner in turn; the first failure stops the rest and is thrown on. */
  async flushAll(write: (owner: string, before: Meta, after: Meta) => Promise<void>) {
    for (const owner of this.owners())
      await this.flush(owner, (before, after) => write(owner, before, after));
  }
}

/** A note somebody else has locked keeps the metadata it had, whatever the
 *  proposed change did to it, including removing it. Postgres refuses the
 *  write either way; this keeps the list from showing a move it rejected. */
export function keepLockedNotes(base: Meta, proposed: Meta, selfId: string | null): Meta {
  const held = new Map(
    base.notes
      .filter((note) => note.lockedBy && note.lockedBy !== selfId)
      .map((note) => [note.id, note]),
  );
  if (held.size === 0) return proposed;
  return {
    ...proposed,
    notes: [
      ...proposed.notes.map((note) => held.get(note.id) ?? note),
      ...[...held.values()].filter((note) => !proposed.notes.some((kept) => kept.id === note.id)),
    ],
  };
}

export interface NoteMove {
  id: string;
  /** The place in the sidebar the row is thrown at. */
  to: string | null;
  /** Whether the row leaves the list on screen. */
  leaves: boolean;
}

/** Where each note went between two versions of a scope. `showingAll` is
 *  whether the list is All notes, where a note changing folder stays put. */
export function noteMoves(base: Meta, next: Meta, showingAll: boolean): NoteMove[] {
  const was = new Map(base.notes.map((note) => [note.id, note]));
  const moves: NoteMove[] = [];
  for (const note of next.notes) {
    const prev = was.get(note.id);
    const home = note.folderId ?? ALL;
    if (!prev?.trashedAt && note.trashedAt) moves.push({ id: note.id, to: TRASH, leaves: true });
    else if (prev?.trashedAt && !note.trashedAt)
      moves.push({ id: note.id, to: note.archivedAt ? ARCHIVE : home, leaves: true });
    else if (!prev?.archivedAt && note.archivedAt)
      moves.push({ id: note.id, to: ARCHIVE, leaves: true });
    else if (prev?.archivedAt && !note.archivedAt)
      moves.push({ id: note.id, to: home, leaves: true });
    else if (prev && prev.folderId !== note.folderId)
      moves.push({ id: note.id, to: home, leaves: !showingAll });
  }
  return moves;
}
