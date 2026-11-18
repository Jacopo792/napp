import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedDocument } from "@notes-app/core/editor/ydoc.ts";
import { versionKeeper } from "./versions.ts";

const paragraph = (marks?: { type: string }[]) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Same words", marks }] }],
});

test("bold alone is a version; nothing changed is not", async () => {
  let inserts = 0;
  const service = {
    from: () => ({ insert: async () => (inserts++, { error: null }) }),
  } as unknown as SupabaseClient;
  const keeper = versionKeeper(service);
  const plain = seedDocument("Note", paragraph());
  const bold = seedDocument("Note", paragraph([{ type: "bold" }]));

  keeper.loaded("n", plain);
  keeper.touched("n", "a", "u");
  await keeper.settle("n", plain, true);
  assert.equal(inserts, 0);

  keeper.loaded("n", plain);
  keeper.touched("n", "a", "u");
  await keeper.settle("n", bold, true);
  assert.equal(inserts, 1);
  plain.destroy();
  bold.destroy();
});
