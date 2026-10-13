import assert from "node:assert/strict";
import test from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { BASE_EXTENSIONS } from "./content.ts";
import {
  DELETE,
  INSERT,
  settle,
  suggest,
  suggestionsIn,
  type SuggestionMode,
} from "./suggestions.ts";

const schema = getSchema(BASE_EXTENSIONS);
const ME: SuggestionMode = { on: true, author: "me" };

function stateOf(text: string, caret: number): EditorState {
  const doc = schema.node("doc", null, [
    schema.node("paragraph", null, text ? [schema.text(text)] : []),
  ]);
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, caret) });
}

/** Apply `edit` as a writer would, with the suggestion plugin's answer. */
function apply(
  state: EditorState,
  edit: (s: EditorState) => ReturnType<EditorState["tr"]["insertText"]>,
  mode = ME,
) {
  const tr = edit(state);
  const next = state.apply(tr);
  const appended = suggest([tr], state, next, mode);
  return appended ? next.apply(appended) : next;
}

const marked = (state: EditorState) =>
  suggestionsIn(state.doc).map((one) => [
    one.kind,
    state.doc.textBetween(one.from, one.to),
    one.author,
  ]);

test("typed words are proposed, not written", () => {
  const after = apply(stateOf("Il gatto", 9), (s) => s.tr.insertText(" nero"));
  assert.equal(after.doc.textContent, "Il gatto nero");
  assert.deepEqual(marked(after), [[INSERT, " nero", "me"]]);
});

test("deleted words stay, struck, and Backspace walks left over them", () => {
  // Backspace twice from the end of "gatto".
  let state = stateOf("Il gatto", 9);
  state = apply(state, (s) => s.tr.delete(8, 9));
  state = apply(state, (s) => s.tr.delete(s.selection.from - 1, s.selection.from));
  assert.equal(state.doc.textContent, "Il gatto");
  assert.deepEqual(marked(state), [[DELETE, "to", "me"]]);
  assert.equal(state.selection.from, 7);
});

test("typing over a selection proposes both halves", () => {
  const state = apply(stateOf("Il gatto", 4), (s) => s.tr.insertText("cane", 4, 9));
  assert.equal(state.doc.textContent, "Il gattocane");
  assert.deepEqual(marked(state), [
    [DELETE, "gatto", "me"],
    [INSERT, "cane", "me"],
  ]);
});

test("deleting your own proposal takes it back for real", () => {
  let state = apply(stateOf("Il gatto", 9), (s) => s.tr.insertText(" nero"));
  state = apply(state, (s) => s.tr.delete(10, 14));
  assert.equal(state.doc.textContent, "Il gatto ");
  assert.deepEqual(marked(state), [[INSERT, " ", "me"]]);
});

test("nothing is tracked while Suggesting is off", () => {
  const state = apply(stateOf("Il gatto", 9), (s) => s.tr.insertText(" nero"), {
    on: false,
    author: "me",
  });
  assert.deepEqual(marked(state), []);
});

test("accepting and rejecting settle the proposals", () => {
  let state = apply(stateOf("Il gatto", 4), (s) => s.tr.insertText("cane", 4, 9));
  const accepted = state.apply(settle(state, suggestionsIn(state.doc), true));
  assert.equal(accepted.doc.textContent, "Il cane");
  assert.deepEqual(marked(accepted), []);
  const rejected = state.apply(settle(state, suggestionsIn(state.doc), false));
  assert.equal(rejected.doc.textContent, "Il gatto");
  assert.deepEqual(marked(rejected), []);
  state = rejected;
});
