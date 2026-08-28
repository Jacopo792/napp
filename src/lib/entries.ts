import type { Note } from "./types";

/** A decrypted note plus the optimistic-concurrency version stored in Postgres. */
export interface NoteEntry {
  note: Note;
  version: number;
}
