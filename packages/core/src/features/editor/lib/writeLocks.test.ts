import assert from "node:assert/strict";
import test from "node:test";
import type { JSONContent } from "@tiptap/core";
import { updateYFragment } from "y-prosemirror";
import * as Y from "yjs";
import { lockedPassages, revertIfBroken } from "./writeLocks.ts";
import { BODY_FRAGMENT, noteSchema, projectDocument, seedDocument } from "./ydoc.ts";

const ANNA = "anna";
const BRUNO = "bruno";

function locked(owner: string, text: string): JSONContent {
  return { type: "text", text, marks: [{ type: "writeLock", attrs: { owner } }] };
}

/** A note whose middle sentence Anna has taken back. */
function note(): Y.Doc {
  return seedDocument("Title", {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Open above. " }] },
      { type: "paragraph", content: [locked(ANNA, "Mine to write.")] },
      { type: "paragraph", content: [{ type: "text", text: "Open below." }] },
    ],
  });
}

/** What an editor does with every keystroke — diff a new document into the
 *  fragment — on that member's own copy, returning the update it sends. */
function write(doc: Y.Doc, content: JSONContent): Uint8Array {
  const copy = new Y.Doc();
  Y.applyUpdate(copy, Y.encodeStateAsUpdate(doc));
  const before = Y.encodeStateVector(copy);
  copy.transact(() => {
    updateYFragment(copy, copy.getXmlFragment(BODY_FRAGMENT), noteSchema().nodeFromJSON(content), {
      mapping: new Map(),
      isOMark: new Map(),
    });
  });
  return Y.encodeStateAsUpdate(copy, before);
}

/** What the server does with a member's update. */
function receive(doc: Y.Doc, update: Uint8Array, userId: string) {
  const revert = revertIfBroken(doc, update, userId);
  Y.applyUpdate(doc, update);
  if (revert) Y.applyUpdate(doc, revert);
  return revert !== null;
}

const text = (doc: Y.Doc) =>
  (projectDocument(doc).content.content ?? []).map((p) =>
    (p.content ?? []).map((t) => t.text).join(""),
  );

const body = (above: JSONContent[], middle: JSONContent[], below = "Open below.") => ({
  type: "doc",
  content: [
    { type: "paragraph", content: above },
    { type: "paragraph", content: middle },
    { type: "paragraph", content: [{ type: "text", text: below }] },
  ],
});
const plainText = (value: string): JSONContent[] => [{ type: "text", text: value }];

test("a locked passage is read from the document by its holder", () => {
  assert.deepEqual([...lockedPassages(note())], [[ANNA, "Mine to write."]]);
});

test("the holder is not judged against their own lock", () => {
  const doc = note();
  const update = write(doc, body(plainText("Open above. "), [locked(ANNA, "Mine, rewritten.")]));
  assert.equal(revertIfBroken(doc, update, ANNA), null);
});

test("writing outside the lock is nobody's business but the writer's", () => {
  const doc = note();
  const update = write(
    doc,
    body(plainText("Open above, and added to. "), [locked(ANNA, "Mine to write.")]),
  );
  assert.equal(receive(doc, update, BRUNO), false);
  assert.equal(text(doc)[0], "Open above, and added to. ");
});

test("writing inside somebody else's lock is taken back", () => {
  const doc = note();
  const update = write(
    doc,
    body(plainText("Open above. "), [locked(ANNA, "Mine to write, said Bruno.")]),
  );
  assert.equal(receive(doc, update, BRUNO), true);
  assert.deepEqual([...lockedPassages(doc)], [[ANNA, "Mine to write."]]);
});

test("lifting somebody else's lock is breaking it", () => {
  const doc = note();
  const update = write(doc, body(plainText("Open above. "), plainText("Mine to write.")));
  assert.equal(receive(doc, update, BRUNO), true);
  assert.deepEqual([...lockedPassages(doc)], [[ANNA, "Mine to write."]]);
});

test("a lock stamped with somebody else's name is not a lock", () => {
  const doc = note();
  const update = write(
    doc,
    body([locked("carla", "Not hers to hold.")], [locked(ANNA, "Mine to write.")]),
  );
  assert.equal(receive(doc, update, BRUNO), true);
  assert.deepEqual([...lockedPassages(doc)], [[ANNA, "Mine to write."]]);
});

test("locking a passage in your own name is yours to do", () => {
  const doc = note();
  const update = write(
    doc,
    body([locked(BRUNO, "Open above. ")], [locked(ANNA, "Mine to write.")]),
  );
  assert.equal(receive(doc, update, BRUNO), false);
});

/* The server awaits between hearing a message and applying it. The holder's
   own edit to their passage, landing in that gap, is not the writer's doing —
   and a writer whose update is taken back loses only that update. */
test("another member's change landing in between is neither blamed nor erased", () => {
  const doc = note();
  const brunos = write(
    doc,
    body(
      plainText("Open above. "),
      [locked(ANNA, "Mine to write.")],
      "Open below, typed by Bruno.",
    ),
  );
  const revert = revertIfBroken(doc, brunos, BRUNO);
  Y.applyUpdate(
    doc,
    write(doc, body(plainText("Open above. "), [locked(ANNA, "Anna's new words.")])),
  );
  Y.applyUpdate(doc, brunos);
  assert.equal(revert, null);
  assert.deepEqual(text(doc), ["Open above. ", "Anna's new words.", "Open below, typed by Bruno."]);
});

test("taking back a broken update keeps what somebody else typed meanwhile", () => {
  const doc = note();
  const forced = write(doc, body(plainText("Open above. "), [locked(ANNA, "Bruno was here.")]));
  const revert = revertIfBroken(doc, forced, BRUNO);
  Y.applyUpdate(
    doc,
    write(doc, body(plainText("Open above, Anna typing. "), [locked(ANNA, "Mine to write.")])),
  );
  Y.applyUpdate(doc, forced);
  Y.applyUpdate(doc, revert!);
  assert.deepEqual(text(doc), ["Open above, Anna typing. ", "Mine to write.", "Open below."]);
});
