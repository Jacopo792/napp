import assert from "node:assert/strict";
import test from "node:test";
import * as Y from "yjs";
import { seedDocument } from "@notes-app/core/editor/ydoc.ts";
import { storeDocument } from "./documents.ts";

const link = (extra = {}) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "La folie",
          marks: [{ type: "noteLink", attrs: { noteId: "n1", ...extra } }],
        },
      ],
    },
  ],
});

function stub(rowContent: unknown) {
  let sent: unknown;
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { content: rowContent }, error: null }) }),
      }),
    }),
    rpc: async (_: string, args: { projected_content: unknown }) => {
      sent = args.projected_content;
      return { error: null };
    },
  };
  return { service: service as never, sent: () => sent };
}

test("a row that differs only by null attributes is handed back unchanged", async () => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(seedDocument("T", link() as never)));
  const old = link();
  const s = stub(old);
  await storeDocument(s.service, "id", doc);
  assert.equal(s.sent(), old);
});

test("a real change still goes through", async () => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, Y.encodeStateAsUpdate(seedDocument("T", link() as never)));
  const s = stub(link({ noteId: "other" }));
  await storeDocument(s.service, "id", doc);
  assert.notEqual(s.sent(), undefined);
  assert.equal(JSON.stringify(s.sent()).includes('"n1"'), true);
});
