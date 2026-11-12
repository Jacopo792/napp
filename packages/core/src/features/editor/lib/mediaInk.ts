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

/* ── Crop and rotation ───────────────────────────────────────────────────────
   A picture is never re-encoded. Its view is a crop rectangle, normalised to the
   original (0..1), and a number of clockwise quarter turns applied after the
   crop. Ink stays in original-image units (1000 across the original width), so
   the view is one transform over picture and ink together. */
export type Crop = { x: number; y: number; w: number; h: number };
export type ImageView = { crop: Crop; turns: number };

export const WHOLE_CROP: Crop = { x: 0, y: 0, w: 1, h: 1 };
const MIN_CROP = 0.05;

/** Stored as the string "x,y,w,h" so Yjs holds it as one plain attribute. Anything that is
 *  not a rectangle inside the picture is the whole picture. */
export function readView(crop: unknown, turns: unknown): ImageView {
  const n = typeof crop === "string" ? crop.split(",").map(Number) : [];
  const [x, y, w, h] = n;
  const ok =
    n.length === 4 &&
    n.every(Number.isFinite) &&
    x >= 0 &&
    y >= 0 &&
    w >= MIN_CROP &&
    h >= MIN_CROP &&
    x + w <= 1.0001 &&
    y + h <= 1.0001;
  const t = Number(turns);
  return {
    crop: ok ? { x, y, w, h } : WHOLE_CROP,
    turns: Number.isFinite(t) ? ((Math.round(t) % 4) + 4) % 4 : 0,
  };
}

export const writeCrop = (c: Crop) =>
  isWholeCrop(c) ? "" : [c.x, c.y, c.w, c.h].map((v) => Number(v.toFixed(4))).join(",");
export const isWholeCrop = (c: Crop) => c.x <= 0 && c.y <= 0 && c.w >= 1 && c.h >= 1;
export const isWholeView = (v: ImageView) => isWholeCrop(v.crop) && v.turns === 0;

/** Width over height of what the view shows, for an original of `iw` × `ih`. */
export function viewAspect(v: ImageView, iw: number, ih: number): number {
  const a = (v.crop.w * iw) / (v.crop.h * ih);
  return v.turns % 2 ? 1 / a : a;
}

/** A point of the original (0..1 each way) as the view shows it (0..1 each way). */
export function viewPoint(v: ImageView, u: number, w: number): { u: number; v: number } {
  const a = (u - v.crop.x) / v.crop.w;
  const b = (w - v.crop.y) / v.crop.h;
  return [
    { u: a, v: b },
    { u: 1 - b, v: a },
    { u: 1 - a, v: 1 - b },
    { u: b, v: 1 - a },
  ][v.turns];
}

/** The inverse of the rotation alone: where a point of the rotated whole
 *  picture sits in the original. Used to turn a rectangle drawn on screen into a crop. */
export function unturnPoint(turns: number, a: number, b: number): { u: number; v: number } {
  return [
    { u: a, v: b },
    { u: b, v: 1 - a },
    { u: 1 - a, v: 1 - b },
    { u: 1 - b, v: a },
  ][((turns % 4) + 4) % 4];
}

/** The same for a rectangle (two opposite corners in rotated space). */
export function unturnRect(turns: number, r: Crop): Crop {
  const p = unturnPoint(turns, r.x, r.y);
  const q = unturnPoint(turns, r.x + r.w, r.y + r.h);
  const x = Math.min(p.u, q.u);
  const y = Math.min(p.v, q.v);
  return { x, y, w: Math.abs(q.u - p.u), h: Math.abs(q.v - p.v) };
}

/** A crop of the original as it sits on the rotated whole picture. */
export function turnRect(turns: number, c: Crop): Crop {
  const p = viewPoint({ crop: WHOLE_CROP, turns }, c.x, c.y);
  const q = viewPoint({ crop: WHOLE_CROP, turns }, c.x + c.w, c.y + c.h);
  return {
    x: Math.min(p.u, q.u),
    y: Math.min(p.v, q.v),
    w: Math.abs(q.u - p.u),
    h: Math.abs(q.v - p.v),
  };
}

/** Where the picture's plane goes inside a view box one unit wide: its width,
 *  and the translation (in view widths) that puts the crop's centre at the box's centre
 *  once the plane is turned about its own origin. */
export function planeFit(v: ImageView, iw: number, ih: number) {
  const aspect = viewAspect(v, iw, ih);
  const boxW = v.turns % 2 ? 1 / aspect : 1;
  const width = boxW / v.crop.w;
  const height = (width * ih) / iw;
  return {
    aspect,
    width,
    centre: { x: 0.5, y: 0.5 / aspect },
    offset: { x: (v.crop.x + v.crop.w / 2) * width, y: (v.crop.y + v.crop.h / 2) * height },
  };
}
