/* A drawing surface, and what a browser can do that the schema cannot.
 *
 * Two surfaces, one node. A **board** is a sheet of its own, in the flow of
 * the note like a picture. A **page** drawing is the note marked up the way a
 * screenshot is: the strokes lie over the paragraphs and the headings, and the
 * layer is transparent to the pointer until the pen is picked up, so the text
 * underneath stays text.
 *
 * A stroke is gathered in local state while the pointer is down and written to
 * the document once, on release. Writing per pointer event would be a Yjs
 * update per pixel of a gesture, sent to the other member and persisted, for a
 * line nobody has finished drawing yet.
 *
 * The pointer is followed with `window` listeners rather than
 * `setPointerCapture`, for the reason the cover learned the hard way: a
 * captured pointer retargets the click that follows to the capturing element,
 * and every control sitting on this surface would go dead the moment somebody
 * drew on it.
 *
 * ponytail: a page stroke is placed against the width of the column, not
 * against the words under it — so a note read at another width keeps the shape
 * of the drawing and loses which paragraph it was pointing at. Anchoring ink
 * to text means a mark in the document, like `CommentAnchor`, and a drawing
 * that is a mark is a different feature.
 */

/** Asking for the pen again on a note that already has a drawing layer. */
export const TAKE_UP_THE_PEN = "napp:take-up-the-pen";

/** Set for the one layer being created right now, and read once by the view
 *  that mounts for it.
 *
 *  The pen is in hand because it was just asked for, and that is a fact about
 *  the moment rather than about the note — which is exactly what the layer's
 *  own mount cannot tell. A view that picked the pen up whenever it mounted
 *  picked it up again on every return to the note, so somebody who came back
 *  to write drew instead. It cannot be an attribute either: an attribute is
 *  the document, and the document is the other member's too. */
let penWanted = false;

/** The same for a board: one just inserted opens straight onto its stage. */
let boardWanted = false;

export function requestDrawing(surface: "board" | "page") {
  if (surface === "board") boardWanted = true;
  else penWanted = true;
}
/** Consume insertion intent once; reopening a note must not pick its pen up. */
export function consumeDrawing(surface: "board" | "page"): boolean {
  const wanted = surface === "board" ? boardWanted : penWanted;
  if (surface === "board") boardWanted = false;
  else penWanted = false;
  return wanted;
}
