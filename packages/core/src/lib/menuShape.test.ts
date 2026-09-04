import assert from "node:assert/strict";
import test from "node:test";
import { findItem, forSystem, type MenuItem } from "./menuShape.ts";

const menu: MenuItem[] = [
  { kind: "item", id: "pin", label: "Pin note", checked: true, run: () => {} },
  { kind: "label", label: "Locked by Anna" },
  { kind: "separator" },
  {
    kind: "item",
    id: "move",
    label: "Move note",
    submenu: [
      { kind: "label", label: "Move to" },
      { kind: "item", id: "move:unfiled", label: "Unfiled", run: () => {} },
    ],
  },
  {
    kind: "item",
    id: "recent",
    label: "Recent notes",
    whenEmpty: "No recent notes yet",
    submenu: [],
  },
];

test("a label crosses as an item nobody can choose", () => {
  const [, locked] = forSystem(menu);
  assert.deepEqual(locked, { type: "item", label: "Locked by Anna", enabled: false });
});

test("nothing that cannot cross a process boundary crosses it", () => {
  const flat = JSON.stringify(forSystem(menu));
  assert.ok(!flat.includes("icon"), flat);
  assert.equal(JSON.parse(flat)[0].checked, true);
});

test("an empty submenu goes as the one line it would have shown", () => {
  const recent = forSystem(menu).at(-1);
  assert.deepEqual(recent, {
    type: "item",
    id: "recent",
    label: "Recent notes",
    checked: undefined,
    submenu: [{ type: "item", label: "No recent notes yet", enabled: false }],
  });
});

test("an id is found wherever in the tree it is", () => {
  const deep = findItem(menu, "move:unfiled");
  assert.ok(deep?.kind === "item" && deep.label === "Unfiled");
  assert.equal(findItem(menu, "nothing"), undefined);
});
