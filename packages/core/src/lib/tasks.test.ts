import assert from "node:assert/strict";
import test from "node:test";
import { dueOf, tasksIn, yourTasks } from "./tasks.ts";

const task = (text: string, checked = false) => ({
  type: "taskItem",
  attrs: { checked },
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const doc = (...items: unknown[]) => ({
  type: "doc",
  content: [{ type: "taskList", content: items }],
});

test("a date is read as it is written, and a wrong one is no date", () => {
  assert.equal(dueOf("consegna 2026-10-20", 2026), "2026-10-20");
  assert.equal(dueOf("entro il 20/10", 2026), "2026-10-20");
  assert.equal(dueOf("entro il 5.11.27", 2026), "2027-11-05");
  assert.equal(dueOf("il 31/02", 2026), null);
  assert.equal(dueOf("capitolo 2 e 3", 2026), null);
  assert.equal(dueOf("versione 1.2.3", 2026), null);
});

test("the tasks that want you are yours by name, or your own with a date", () => {
  const members = [
    { userId: "me", name: "Anna" },
    { userId: "them", name: "Bo" },
  ];
  const notes = [
    {
      id: "mine",
      ownerId: "me",
      content: doc(task("Rileggere 21/10"), task("Senza data"), task("Fatto 01/10", true)),
    },
    {
      id: "theirs",
      ownerId: "them",
      content: doc(
        task("@Anna controlla le note 15/10"),
        task("@Bo il resto 14/10"),
        task("Data loro 14/10"),
      ),
    },
  ];
  const tasks = yourTasks(notes, members, "me", new Date(2026, 9, 13));
  assert.deepEqual(
    tasks.map((one) => [one.noteId, one.text, one.due]),
    [
      ["theirs", "@Anna controlla le note 15/10", "2026-10-15"],
      ["mine", "Rileggere 21/10", "2026-10-21"],
    ],
  );
  assert.equal(tasksIn(doc(task("  "))).length, 0);
});
