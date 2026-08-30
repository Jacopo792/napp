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
