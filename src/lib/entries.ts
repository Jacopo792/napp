import type { Note } from "./types";

/** A note plus the optimistic-concurrency version stored in Postgres. */
export interface NoteEntry {
  note: Note;
  version: number;
}
