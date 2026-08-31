import assert from "node:assert/strict";
import test from "node:test";
import { avatarCropRect, avatarDragBound } from "./image.ts";

const landscape = { imageWidth: 1200, imageHeight: 800, viewport: 240 };

test("no zoom and no drag cuts the same square the old centre crop cut", () => {
  const crop = avatarCropRect({ ...landscape, zoom: 1, offsetX: 0, offsetY: 0 });
  assert.equal(crop.edge, 800);
  assert.equal(crop.x, 200);
  assert.equal(crop.y, 0);
});

test("dragging the picture right moves the square left, in image pixels", () => {
  // At zoom 1 the scale is 240/800 = 0.3, so 30 viewport px is 100 image px.
  const crop = avatarCropRect({ ...landscape, zoom: 1, offsetX: 30, offsetY: 0 });
  assert.equal(crop.x, 100);
});

test("zooming in takes a smaller square", () => {
  const crop = avatarCropRect({ ...landscape, zoom: 2, offsetX: 0, offsetY: 0 });
  assert.equal(crop.edge, 400);
  assert.equal(crop.x, 400);
  assert.equal(crop.y, 200);
});

test("a drag past the edge still cuts a square inside the image", () => {
  const crop = avatarCropRect({ ...landscape, zoom: 1, offsetX: 9999, offsetY: -9999 });
  assert.equal(crop.x, 0);
  assert.equal(crop.y, 0);
  assert.ok(crop.edge <= 800);
});

test("the bound is half of what the scaled image has over the viewport", () => {
  // 1200 wide scaled by 0.3 is 360; 360 - 240 leaves 120, so 60 either way.
  assert.equal(
    avatarDragBound({ imageSide: 1200, imageShortSide: 800, viewport: 240, zoom: 1 }),
    60,
  );
  // The short side exactly covers the viewport, so it cannot move at all.
  assert.equal(avatarDragBound({ imageSide: 800, imageShortSide: 800, viewport: 240, zoom: 1 }), 0);
});

test("the square cut is exactly the circle the cropper drew", () => {
  /* The one identity the two halves have to agree on: scale the cut square by
     the same factor the preview scales the picture with, and it must come back
     as the viewport itself. It did not, for as long as the drawn circle was
     inset inside the square being measured. */
  for (const zoom of [1, 1.4, 2, 3]) {
    for (const offsetX of [0, 40, -40]) {
      const view = { ...landscape, zoom, offsetX, offsetY: 0 };
      const scale = (view.viewport / Math.min(view.imageWidth, view.imageHeight)) * zoom;
      assert.equal(
        Math.round(avatarCropRect(view).edge * scale),
        view.viewport,
        `zoom ${zoom} cut a square the circle did not show`,
      );
    }
  }
});
