import assert from "node:assert/strict";
import test from "node:test";
import { BUILT_IN_TEMPLATES, instantiateTemplate, templateFromNote } from "./templates.ts";

test("template instances receive fresh identity and do not share content", () => {
  const template = BUILT_IN_TEMPLATES[0];
  const note = instantiateTemplate(template, "member", "2026-08-31T10:00:00.000Z", "note-1");
  assert.equal(note.id, "note-1");
  assert.equal(note.ownerId, "member");
  assert.notEqual(note.content, template.content);
  note.content.content?.push({ type: "paragraph" });
  assert.notEqual(note.content.content?.length, template.content.content?.length);
});

test("saving a note as a template copies page properties", () => {
  const note = instantiateTemplate(null, "member", "2026-08-31T10:00:00.000Z", "note-1");
  note.pageIcon = { kind: "symbol", value: "star" };
  note.cover = { kind: "preset", id: "museum", position: 0.25 };
  const template = templateFromNote(
    note,
    " Favourite ",
    " Reusable ",
    "archive",
    "member",
    "2026-08-31T11:00:00.000Z",
    "template-1",
  );
  assert.equal(template.name, "Favourite");
  assert.deepEqual(template.pageIcon, note.pageIcon);
  assert.deepEqual(template.cover, note.cover);
  assert.notEqual(template.content, note.content);
});
