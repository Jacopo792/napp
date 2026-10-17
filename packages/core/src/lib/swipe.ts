/* A row pushed sideways: where it rests open, how far it may travel, and where
 * it settles when the hand lets go. The web's NoteList and the phone's list read
 * these, so the gesture is tuned once.
 *
 * The push opens; the press acts. There is no distance that does anything —
 * see "Taking a note back" in CLAUDE.md. The "worklet" lines let Reanimated
 * run the two functions on the phone's UI thread; anywhere else they are a
 * string nobody reads. */

/** Where a row rests with its button showing. */
export const OPEN = 92;
/* 56 of give is enough to feel the row resist and not enough to look like a
   threshold that was missed. */
export const MAX = OPEN + 56;

/** The clamp is not tidiness: momentum after the hand has gone would otherwise
 *  carry the row half the column. */
export function clampTravel(value: number): number {
  "worklet";
  return Math.max(-MAX, Math.min(MAX, value));
}

/** Where a released row comes to rest: open on the side it was pushed past
 *  half way, closed otherwise. A position, never an act. */
export function settleTravel(travelled: number): number {
  "worklet";
  if (travelled <= -OPEN / 2) return -OPEN;
  if (travelled >= OPEN / 2) return OPEN;
  return 0;
}
