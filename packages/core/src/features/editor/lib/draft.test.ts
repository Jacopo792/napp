import assert from "node:assert/strict";
import test from "node:test";

/* The draft store restores itself at import, so the stub has to be in place
   before it is loaded — hence one seeded store and a dynamic import. */

const store = new Map<string, string>();
(globalThis as { sessionStorage?: unknown }).sessionStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const paragraph = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

store.set(
  "napp:drafts",
  JSON.stringify({
    n1: {
      draft: { title: "Half written", body: "typed", content: paragraph("typed") },
      base: { title: "Half written", body: "", content: paragraph("") },
    },
  }),
);

const draft = await import("./draft.ts");

test("a reload gets the words back, still unsaved", () => {
  assert.equal(draft.readDraft("n1")?.body, "typed");
  assert.equal(draft.isDirty("n1"), true);
  assert.equal(draft.hasPending(), true);
});

test("the base comes back with it, or the next merge reads a deletion", () => {
  assert.equal(draft.readBase("n1")?.body, "");
});

test("the stored note does not overwrite the restored draft", () => {
  draft.ensureDraft("n1", { title: "From the archive", body: "old", content: paragraph("old") });
  assert.equal(draft.readDraft("n1")?.body, "typed");
});

test("signing out leaves no note text behind", () => {
  draft.clearDrafts();
  assert.equal(draft.hasPending(), false);
  assert.equal(store.has("napp:drafts"), false);
});

test("typing and then restoring the saved text does not leave a pending edit", () => {
  const saved = { title: "A note", body: "kept", content: paragraph("kept") };
  draft.ensureDraft("n2", saved, "2026-08-30T10:00:00.000Z");
  draft.editBody("n2", "temporary", paragraph("temporary"));
  assert.equal(draft.isDirty("n2"), true);

  draft.editBody("n2", "kept", paragraph("kept"));
  assert.equal(draft.isDirty("n2"), false);
  assert.equal(draft.takePending().length, 0);
});

test("an empty final paragraph left by an erased new line is not an edit", () => {
  const saved = { title: "A note", body: "kept", content: paragraph("kept") };
  draft.ensureDraft("n4", saved, "2026-08-30T10:00:00.000Z");
  draft.editBody("n4", "kept", {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "kept" }] },
      { type: "paragraph" },
    ],
  });

  assert.equal(draft.isDirty("n4"), false);
  assert.equal(draft.takePending().length, 0);
});

test("a final space left after erasing a word is not an edit", () => {
  const saved = { title: "A note", body: "kept", content: paragraph("kept") };
  draft.ensureDraft("n5", saved, "2026-08-30T10:00:00.000Z");
  draft.editBody("n5", "kept", paragraph("kept "));

  assert.equal(draft.isDirty("n5"), false);
  assert.equal(draft.takePending().length, 0);
});

test("Tiptap object-key reordering after an erased edit is not an edit", () => {
  const original = {
    title: "A note",
    body: "kept",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "kept", marks: [{ type: "italic" }] }],
        },
      ],
    },
  };
  draft.ensureDraft("n6", original, "2026-08-30T10:00:00.000Z");
  draft.editBody("n6", "temporary", paragraph("temporary"));
  draft.takePending();
  draft.rebaseDraft("n6", { ...original, body: "temporary", content: paragraph("temporary") });

  draft.editBody("n6", "kept", {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", marks: [{ type: "italic" }], text: "kept" }],
      },
      { type: "paragraph" },
    ],
  });

  assert.equal(draft.takePending()[0]?.restoreUpdatedAt, "2026-08-30T10:00:00.000Z");
});

test("returning to the original text after an autosave restores its edit time", () => {
  const original = { title: "A note", body: "kept", content: paragraph("kept") };
  const changed = { title: "A note", body: "temporary", content: paragraph("temporary") };
  draft.ensureDraft("n3", original, "2026-08-30T10:00:00.000Z");
  draft.editBody("n3", changed.body, changed.content);
  assert.equal(draft.takePending()[0]?.restoreUpdatedAt, null);
  draft.rebaseDraft("n3", changed);
  // This mirrors the catalogue render caused by the just-finished autosave.
  draft.ensureDraft("n3", changed, "2026-08-30T12:00:00.000Z");

  draft.editBody("n3", original.body, original.content);
  assert.equal(draft.takePending()[0]?.restoreUpdatedAt, "2026-08-30T10:00:00.000Z");
});
