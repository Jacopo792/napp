/* What changed between two versions of a note, in words.
 *
 * Shared by the collaboration server, which stamps each version with how much
 * was added and taken away, and by the history panel, which shows the change
 * itself. One diff, so the "+12" on a row and the green under it agree.
 *
 * Plain text, not the document tree: what a reader means by "what did she
 * change" is the words. A bold that came off is not in this answer, and that
 * is deliberate rather than an oversight. */
import diff from "fast-diff";

export type TextChange = [-1 | 0 | 1, string];

export function textChanges(before: string, after: string): TextChange[] {
  return diff(before, after) as TextChange[];
}

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** A word half-retyped counts once on each side: a reader asked how much
 *  moved, and "one word changed" is that. */
export function wordTally(changes: TextChange[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const [kind, text] of changes) {
    if (kind === 1) added += words(text);
    else if (kind === -1) removed += words(text);
  }
  return { added, removed };
}
