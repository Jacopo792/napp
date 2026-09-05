import assert from "node:assert/strict";
import test from "node:test";
import { splitMediaStroke } from "./mediaInk.ts";
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
