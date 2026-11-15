import { ArrowUpRight, Circle, Minus, Move, Square, Type } from "@/components/icons";
import type { DrawingShape } from "../lib/content";

/** What the hand may be holding besides the pen: the four shapes, the one that
 *  writes rather than draws, and the one that draws nothing and arranges what
 *  is there. All in the same slot and none of them a toggle of its own,
 *  because you are drawing a rectangle or captioning one or moving one, and
 *  never two of those at once. */
export type InkTool = DrawingShape | "text" | "move";

/** Three nibs. A slider offers a hundred widths nobody wants to choose
 *  between; these are a fine line, a line, and a marker. */
export const DRAWING_NIBS = [3, 6, 13];

/** What the hand can hold, in the order it reaches for them. Held as a list
 *  for the reason a menu is one in `menuShape.ts`: five buttons written out
 *  are five buttons to keep agreeing with each other, and the sixth somebody
 *  adds will agree with none of them. */
export const DRAWING_TOOLS = [
  { tool: "line", label: "Straight line", Glyph: Minus },
  { tool: "arrow", label: "Arrow", Glyph: ArrowUpRight },
  { tool: "rect", label: "Rectangle", Glyph: Square },
  { tool: "ellipse", label: "Ellipse", Glyph: Circle },
  { tool: "text", label: "Caption", Glyph: Type },
  { tool: "move", label: "Move a mark", Glyph: Move },
] as const satisfies readonly { tool: InkTool; label: string; Glyph: typeof Minus }[];
