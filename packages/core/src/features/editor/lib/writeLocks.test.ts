import assert from "node:assert/strict";
import test from "node:test";
import type { JSONContent } from "@tiptap/core";
import { updateYFragment } from "y-prosemirror";
import * as Y from "yjs";
import { broken, guard, lockedPassages, restore } from "./writeLocks.ts";
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

/** What an editor does with every keystroke: diff a new document into the
 *  fragment. Nothing here goes round the rule — this is the way in. */
function write(doc: Y.Doc, content: JSONContent) {
  doc.transact(() => {
    updateYFragment(doc, doc.getXmlFragment(BODY_FRAGMENT), noteSchema().nodeFromJSON(content), {
      mapping: new Map(),
      isOMark: new Map(),
    });
  });
}

test("a locked passage is read from the document by its holder", () => {
  assert.deepEqual([...lockedPassages(note())], [[ANNA, "Mine to write."]]);
});

test("the holder is not guarded against their own lock", () => {
  assert.equal(guard(note(), ANNA), null);
  assert.notEqual(guard(note(), BRUNO), null);
});

test("a note nobody has locked costs no guard at all", () => {
  const plain = seedDocument("Title", {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Ordinary." }] }],
  });
  assert.equal(guard(plain, BRUNO), null);
});

test("writing outside the lock is nobody's business but the writer's", () => {
  const doc = note();
  const before = guard(doc, BRUNO)!;
  write(doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Open above, and added to. " }] },
      { type: "paragraph", content: [locked(ANNA, "Mine to write.")] },
      { type: "paragraph", content: [{ type: "text", text: "Open below." }] },
    ],
  });
  assert.equal(broken(doc, before), false);
});

test("writing inside somebody else's lock is put back, and the rest with it", () => {
  const doc = note();
  const before = guard(doc, BRUNO)!;
  write(doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Open above. " }] },
      { type: "paragraph", content: [locked(ANNA, "Mine to write, said Bruno.")] },
      { type: "paragraph", content: [{ type: "text", text: "Open below." }] },
    ],
  });
  assert.equal(broken(doc, before), true);

  restore(doc, before);
  assert.equal(broken(doc, before), false);
  assert.deepEqual([...lockedPassages(doc)], [[ANNA, "Mine to write."]]);
  /* Round-tripped through JSON on both sides: y-prosemirror builds attribute
     bags with a null prototype and in its own key order. */
  const plain = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;
  assert.deepEqual(
    plain(projectDocument(doc).content),
    plain(noteSchema().nodeFromJSON(before.snapshot).toJSON()),
  );
});

test("lifting somebody else's lock is breaking it", () => {
  const doc = note();
  const before = guard(doc, BRUNO)!;
  write(doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Open above. " }] },
      { type: "paragraph", content: [{ type: "text", text: "Mine to write." }] },
      { type: "paragraph", content: [{ type: "text", text: "Open below." }] },
    ],
  });
  assert.equal(broken(doc, before), true);
  restore(doc, before);
  assert.deepEqual([...lockedPassages(doc)], [[ANNA, "Mine to write."]]);
});

test("a lock stamped with somebody else's name is not a lock", () => {
  const doc = note();
  const before = guard(doc, BRUNO)!;
  write(doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [locked("carla", "Not hers to hold.")] },
      { type: "paragraph", content: [locked(ANNA, "Mine to write.")] },
      { type: "paragraph", content: [{ type: "text", text: "Open below." }] },
    ],
  });
  assert.equal(broken(doc, before), true);
});

test("locking a passage in your own name is yours to do", () => {
  const doc = note();
  const before = guard(doc, BRUNO)!;
  write(doc, {
    type: "doc",
    content: [
      { type: "paragraph", content: [locked(BRUNO, "Open above. ")] },
      { type: "paragraph", content: [locked(ANNA, "Mine to write.")] },
      { type: "paragraph", content: [{ type: "text", text: "Open below." }] },
    ],
  });
  assert.equal(broken(doc, before), false);
});
