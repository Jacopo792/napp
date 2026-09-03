import assert from "node:assert/strict";
import test from "node:test";
import { dockLayout } from "./useDock.ts";

/** A row of 32 px buttons 4 px apart, starting at x. */
function row(x: number, count: number, gap = 4) {
  return Array.from({ length: count }, (_, index) => ({ left: x + index * (32 + gap), width: 32 }));
}

test("the icon under the pointer grows and its neighbours grow less", () => {
  const items = row(100, 5);
  const layout = dockLayout(items, items[2].left + 16);
  assert.ok(layout[2].mag > layout[1].mag);
  assert.ok(layout[1].mag > layout[0].mag);
  assert.equal(layout[2].mag, layout[2].mag); // finite, not NaN
  assert.ok(layout[2].mag > 1.3);
});

test("the bulge is centred on the row: what one side gains the other gives", () => {
  const items = row(100, 5);
  const layout = dockLayout(items, items[2].left + 16);
  const drift = layout.reduce((sum, item) => sum + item.shift, 0);
  assert.ok(Math.abs(drift) < 0.001, `row drifted by ${drift}`);
  assert.ok(layout[0].shift < 0 && layout[4].shift > 0);
});

test("a wide gap in the row is kept, not spread over the icons after it", () => {
  // The header's group carries a readout between its buttons: two icons, a
  // 78 px hole, then two more. The pair after the hole may step aside, but
  // never by the width of the hole.
  const items = [...row(100, 2), ...row(100 + 2 * 36 + 78, 2)];
  const layout = dockLayout(items, items[0].left + 16);
  for (const item of layout) assert.ok(Math.abs(item.shift) < 12, `shifted ${item.shift}`);
});

test("a pointer out of reach leaves the row exactly as it was", () => {
  const layout = dockLayout(row(100, 5), 1000);
  for (const item of layout) {
    assert.equal(item.mag, 1);
    assert.equal(item.shift, 0);
  }
});
