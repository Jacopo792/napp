import { DRAWING_BOX, strokePoints, type DrawingStroke } from "./content.ts";

type Rect = { left: number; top: number; width: number; height: number };
/** Split at media boundaries, keeping each section in its own surface coordinates. */
export function splitMediaStroke(
  stroke: DrawingStroke,
  page: Rect,
  media: Rect[],
): { target: number; stroke: DrawingStroke }[] {
  if (page.width <= 0) return [{ target: -1, stroke }];
  const points = strokePoints(stroke.d);
  const result: { target: number; stroke: DrawingStroke }[] = [];
  const scale = page.width / DRAWING_BOX.width;
  const emit = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const x = (a.x + b.x) / 2,
      y = (a.y + b.y) / 2;
    const target = media.findIndex(
      (r) =>
        r.width > 0 && x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height,
    );
    const rect = target < 0 ? page : media[target];
    const factor = DRAWING_BOX.width / rect.width;
    const at = (p: { x: number; y: number }) =>
      `${Math.round((p.x - rect.left) * factor)},${Math.round((p.y - rect.top) * factor)}`;
    const last = result.at(-1);
    if (last && last.target === target) last.stroke.d += `L${at(b)}`;
    else
      result.push({
        target,
        stroke: { ...stroke, width: stroke.width * scale * factor, d: `M${at(a)}L${at(b)}` },
      });
  };
  for (let i = 1; i < points.length; i++) {
    const a = { x: page.left + points[i - 1].x * scale, y: page.top + points[i - 1].y * scale };
    const b = { x: page.left + points[i].x * scale, y: page.top + points[i].y * scale };
    const cuts = [0, 1];
    for (const r of media) {
      if (b.x !== a.x)
        for (const x of [r.left, r.left + r.width]) {
          const t = (x - a.x) / (b.x - a.x);
          if (t > 0 && t < 1) cuts.push(t);
        }
      if (b.y !== a.y)
        for (const y of [r.top, r.top + r.height]) {
          const t = (y - a.y) / (b.y - a.y);
          if (t > 0 && t < 1) cuts.push(t);
        }
    }
    const sorted = [...new Set(cuts)].sort((x, y) => x - y);
    const at = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    for (let j = 1; j < sorted.length; j++) emit(at(sorted[j - 1]), at(sorted[j]));
  }
  return result;
}
