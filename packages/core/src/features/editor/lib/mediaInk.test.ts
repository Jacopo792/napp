import assert from "node:assert/strict";
import test from "node:test";
import {
  planeFit,
  readView,
  turnRect,
  unturnRect,
  viewAspect,
  viewPoint,
  splitMediaStroke,
} from "./mediaInk.ts";
const page = { left: 100, top: 100, width: 1000, height: 1800 };
const image = { left: 300, top: 400, width: 500, height: 400 };
const ink = { d: "M300,400L400,500", color: "#123456", width: 5 };
test("page pen stores image ink in image coordinates", () => {
  assert.deepEqual(splitMediaStroke(ink, page, [image]), [
    { target: 0, stroke: { d: "M200,200L400,400", color: "#123456", width: 10 } },
  ]);
});
test("anchored coordinates do not change when both page and media scroll", () => {
  assert.deepEqual(
    splitMediaStroke(ink, page, [image]),
    splitMediaStroke(ink, { ...page, top: -200 }, [{ ...image, top: 100 }]),
  );
});
test("a line crossing a media boundary is split, without dropping its outside section", () => {
  const sections = splitMediaStroke({ ...ink, d: "M100,400L400,400" }, page, [image]);
  assert.deepEqual(
    sections.map((x) => x.target),
    [-1, 0],
  );
  assert.equal(sections[0].stroke.d, "M100,400L200,400");
  assert.equal(sections[1].stroke.d, "M0,200L400,200");
});
test("marks outside media retain page coordinates", () => {
  assert.deepEqual(splitMediaStroke({ ...ink, d: "M0,0L100,100" }, page, [image]), [
    { target: -1, stroke: { ...ink, d: "M0,0L100,100" } },
  ]);
});

test("crop and rotation map a point, the CSS plane agrees, and old values are the whole picture", () => {
  assert.deepEqual(readView(undefined, undefined), { crop: { x: 0, y: 0, w: 1, h: 1 }, turns: 0 });
  assert.deepEqual(readView("0.5,0,0.9,1", 5).crop, { x: 0, y: 0, w: 1, h: 1 });
  const view = readView("0.25,0.1,0.5,0.6", 1);
  assert.equal(view.turns, 1);
  const [iw, ih] = [800, 400];
  const fit = planeFit(view, iw, ih);
  assert.equal(fit.aspect, viewAspect(view, iw, ih));
  for (const [u, v] of [
    [0.25, 0.1],
    [0.5, 0.4],
    [0.75, 0.7],
  ]) {
    const want = viewPoint(view, u, v);
    // translate(centre) rotate(turns) translate(-offset), in units of the box width.
    const px = u * fit.width - fit.offset.x;
    const py = v * fit.width * (ih / iw) - fit.offset.y;
    const [c, s] = [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ][view.turns];
    const x = fit.centre.x + px * c - py * s;
    const y = fit.centre.y + px * s + py * c;
    assert.ok(Math.abs(x - want.u) < 1e-9 && Math.abs(y * fit.aspect - want.v) < 1e-9);
  }
  const mid = viewPoint(view, 0.5, 0.4);
  assert.ok(Math.abs(mid.u - 0.5) < 1e-9 && Math.abs(mid.v - 0.5) < 1e-9);
  const rect = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  for (const turns of [0, 1, 2, 3]) {
    const back = unturnRect(turns, turnRect(turns, rect));
    assert.ok(Object.entries(rect).every(([k, val]) => Math.abs(back[k as "x"] - val) < 1e-9));
  }
});
