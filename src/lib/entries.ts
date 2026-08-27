import type { Note } from "./types";

/** A decrypted note plus the GitHub blob identity needed to write it back. */
export interface NoteEntry {
  note: Note;
  sha: string;
  path: string;
}
