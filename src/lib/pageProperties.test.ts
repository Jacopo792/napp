import assert from "node:assert/strict";
import test from "node:test";
import {
  clampCoverPosition,
  coverFromStorage,
  notePhotoFromStorage,
  withPageProperties,
} from "./pageProperties.ts";

test("cover positions are normalized before reaching layout", () => {
  assert.equal(clampCoverPosition(-2), 0);
  assert.equal(clampCoverPosition(2), 1);
  assert.equal(clampCoverPosition(Number.NaN), 0.5);
});

test("page properties reject unknown persisted shapes", () => {
  const objectId = "b0a8f0de-2b2e-4a3c-9a1f-6d5e4c3b2a10";
  assert.deepEqual(notePhotoFromStorage({ kind: "photo", objectId }), { kind: "photo", objectId });
  /* A path is the reason this is a uuid test and not a string test: the id is
     appended to a Storage prefix. */
  assert.equal(notePhotoFromStorage({ kind: "photo", objectId: "../../secrets" }), null);
  assert.equal(notePhotoFromStorage({ kind: "symbol", value: "star" }), null);
  assert.deepEqual(coverFromStorage({ kind: "preset", id: "forest", position: 9 }), {
    kind: "preset",
    id: "forest",
    position: 1,
  });
  assert.equal(coverFromStorage({ kind: "preset", id: "missing" }), null);
});

test("a cached note takes the picture the archive holds now", () => {
  const cached = {
    id: "n1",
    title: "Note",
    body: "",
    content: { type: "doc", content: [] },
    contentVersion: 1,
    legacyBody: null,
    photo: null,
    cover: null,
    ownerId: null,
    createdAt: "",
    updatedAt: "",
  } as unknown as Parameters<typeof withPageProperties>[0];

  /* Nothing changed: the same object, or every row in the list re-renders on
     every refresh. */
  assert.equal(withPageProperties(cached, { page_icon: null, cover: null }), cached);

  /* A cover set without touching the text does not move the row's version, so
     this is the only path by which it reaches the screen at all. */
  const withCover = withPageProperties(cached, {
    page_icon: null,
    cover: { kind: "preset", id: "forest", position: 0.5 },
  });
  assert.notEqual(withCover, cached);
  assert.deepEqual(withCover.cover, { kind: "preset", id: "forest", position: 0.5 });
  assert.equal(withCover.title, "Note");
  assert.equal(
    withPageProperties(withCover, { page_icon: null, cover: withCover.cover }),
    withCover,
  );
});
