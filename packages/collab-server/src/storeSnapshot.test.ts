import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import * as Y from "yjs";
import { seedDocument, projectDocument, TITLE_TEXT } from "@notes-app/core/editor/ydoc.ts";
import { storeDocument } from "./documents.ts";

test("a write arriving during the row lookup cannot split the persisted binary from its projection", async () => {
  const document = seedDocument("Before", { type: "doc", content: [{ type: "paragraph" }] });
  let saved: { document_state_base64: string; projected_title: string } | undefined;
  const service = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            document.getText(TITLE_TEXT).insert(0, "Changed ");
            return { data: null, error: null };
          },
        }),
      }),
    }),
    rpc: async (_name: string, values: typeof saved) => {
      saved = values;
      return { error: null };
    },
  } as unknown as SupabaseClient;
  await storeDocument(service, crypto.randomUUID(), document);
  assert.ok(saved);
  const persisted = new Y.Doc();
  Y.applyUpdate(persisted, Buffer.from(saved.document_state_base64, "base64"));
  assert.equal(projectDocument(persisted).title, saved.projected_title);
  assert.equal(saved.projected_title, "Before");
  assert.equal(projectDocument(document).title, "Changed Before");
  document.destroy();
  persisted.destroy();
});
