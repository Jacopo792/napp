import assert from "node:assert/strict";
import test from "node:test";
import { windowCommand, type KeyContext, type KeyPress } from "./shortcuts.ts";

const press = (key: string, over: Partial<KeyPress> = {}): KeyPress => ({
  key,
  code: "",
  mod: false,
  alt: false,
  shift: false,
  ...over,
});
const cmd = (key: string) => press(key, { mod: true });
const at = (over: Partial<KeyContext> = {}): KeyContext => ({
  typing: false,
  inText: false,
  linkable: false,
  noteOpen: true,
  noteSelected: true,
  canEdit: true,
  document: false,
  structure: false,
  focusMode: false,
  ...over,
});

test("chords work while typing", () => {
  const writing = at({ typing: true, inText: true });
  assert.equal(windowCommand(cmd("S"), writing), "save");
  assert.equal(windowCommand(cmd("n"), writing), "new");
  assert.equal(windowCommand(cmd(","), writing), "settings");
  assert.equal(windowCommand(cmd("."), writing), "focus");
  assert.equal(windowCommand(cmd("/"), writing), "shortcuts");
});

test("bare keys belong to the field they were typed in", () => {
  for (const key of ["n", "/", "j", "k", "ArrowDown", "Enter", "Escape"])
    assert.equal(windowCommand(press(key), at({ typing: true, focusMode: true })), null, key);
});

test("⌘F finds in the open note, or searches the list", () => {
  assert.equal(windowCommand(cmd("f"), at()), "find");
  assert.equal(windowCommand(cmd("f"), at({ noteOpen: false })), "search");
});

test("⌘K links chosen words only when they may be edited", () => {
  assert.equal(windowCommand(cmd("k"), at({ linkable: true })), "link");
  assert.equal(windowCommand(cmd("k"), at({ linkable: true, canEdit: false })), "palette");
  assert.equal(windowCommand(cmd("k"), at()), "palette");
});

test("⌥D draws, read from the physical key", () => {
  const optionD = press("∂", { code: "KeyD", alt: true });
  assert.equal(windowCommand(optionD, at({ typing: true })), "draw");
  assert.equal(windowCommand(optionD, at({ canEdit: false })), null);
  assert.equal(windowCommand(optionD, at({ noteSelected: false })), null);
});

test("⌘B toggles the sidebar except in the text, where it is Bold", () => {
  assert.equal(windowCommand(cmd("b"), at()), "navigation");
  assert.equal(windowCommand(cmd("b"), at({ typing: true, inText: true })), null);
  assert.equal(windowCommand(cmd("\\"), at({ typing: true, inText: true })), "navigation");
  assert.equal(windowCommand(cmd("\\"), at({ structure: true })), "structure");
  assert.equal(windowCommand(press("b", { mod: true, shift: true }), at()), null);
});

test("a document has chapters and no list keys", () => {
  const book = at({ document: true });
  assert.equal(windowCommand(cmd("n"), book), "new-chapter");
  assert.equal(windowCommand(press("ArrowUp", { mod: true, alt: true }), book), "previous-chapter");
  assert.equal(windowCommand(press("ArrowDown", { mod: true, alt: true }), book), "next-chapter");
  assert.equal(windowCommand(press("j"), book), null);
  assert.equal(windowCommand(press("n"), book), null);
  assert.equal(windowCommand(press("Escape"), at({ document: true, focusMode: true })), "focus");
});

test("the list walks by note, or by group with ⌥", () => {
  assert.equal(windowCommand(press("j"), at()), "down");
  assert.equal(windowCommand(press("ArrowUp"), at()), "up");
  assert.equal(windowCommand(press("ArrowDown", { alt: true }), at()), "next-group");
  assert.equal(windowCommand(press("k", { alt: true }), at()), "previous-group");
  assert.equal(windowCommand(press("n"), at()), "new");
  assert.equal(windowCommand(press("/"), at()), "search-field");
  assert.equal(windowCommand(press("Enter"), at()), "open-title");
  assert.equal(windowCommand(press("Enter"), at({ noteSelected: false })), null);
  assert.equal(windowCommand(press("Escape"), at()), null);
});
