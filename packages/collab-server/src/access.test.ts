import assert from "node:assert/strict";
import test from "node:test";
import { decideAccess, noteIdOf, originAllowed } from "./access.ts";

const NOTE = { id: "n", archive_id: "a", trashed_at: null, locked_by: null };
const ME = "me";
const THEM = "them";

test("a note row level security withheld is simply not available", () => {
  const access = decideAccess(null, "editor", ME);
  assert.equal(access.allowed, false);
});

test("membership decides reading, role decides writing", () => {
  assert.deepEqual(decideAccess(NOTE, null, ME), {
    allowed: false,
    reason: "You are not a member of this archive",
  });
  assert.deepEqual(decideAccess(NOTE, "editor", ME), {
    allowed: true,
    readOnly: false,
    archiveId: "a",
  });
  assert.deepEqual(decideAccess(NOTE, "viewer", ME), {
    allowed: true,
    readOnly: true,
    archiveId: "a",
  });
});

test("a trashed note is read-only even for an editor", () => {
  const trashed = { ...NOTE, trashed_at: "2026-08-31T10:00:00.000Z" };
  assert.deepEqual(decideAccess(trashed, "editor", ME), {
    allowed: true,
    readOnly: true,
    archiveId: "a",
  });
});

test("a locked note is read-only to everybody but its holder, and open to them", () => {
  const locked = { ...NOTE, locked_by: THEM };
  assert.deepEqual(decideAccess(locked, "editor", ME), {
    allowed: true,
    readOnly: true,
    archiveId: "a",
  });
  assert.deepEqual(decideAccess(locked, "editor", THEM), {
    allowed: true,
    readOnly: false,
    archiveId: "a",
  });
});

test("a lock is not a reason to withhold the note itself", () => {
  const access = decideAccess({ ...NOTE, locked_by: THEM }, "editor", ME);
  assert.equal(access.allowed, true);
});

test("a document name is a note id and nothing else", () => {
  assert.equal(
    noteIdOf("11111111-2222-3333-4444-555555555555"),
    "11111111-2222-3333-4444-555555555555",
  );
  assert.equal(noteIdOf("11111111-2222-3333-4444-555555555555/../secrets"), null);
  assert.equal(noteIdOf("notes"), null);
  assert.equal(noteIdOf(""), null);
});

test("only the deployed site and a developer's own machine may connect", () => {
  const allowed = ["https://jacopo792.github.io", "http://localhost:5173"];
  assert.equal(originAllowed("https://jacopo792.github.io", allowed), true);
  assert.equal(originAllowed("http://localhost:5173", allowed), true);
  assert.equal(originAllowed("https://jacopo792.github.io.evil.example", allowed), false);
  assert.equal(originAllowed(null, allowed), false);
  assert.equal(originAllowed(undefined, allowed), false);
  assert.equal(originAllowed("null", allowed), false);
});
