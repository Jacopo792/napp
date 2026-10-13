/* Tasks with a person and a date, read out of the words of a checklist.
 *
 * Evernote and Notion keep an assignee and a due date as fields on a task.
 * Here they are written in the task itself — "Rivedere il capitolo 2
 * @Partner 20/10" — and read back out. No schema, nothing that cannot travel:
 * the words leave in a Markdown export as they are, and a date written
 * 2026-10-20 is what Obsidian's Tasks plugin reads too.
 *
 * A person is a member named after an @, read exactly as a comment's mentions
 * are (`mentionedIn`). A date is the first one written as 2026-10-20, 20/10 or
 * 20/10/2026 (dots for slashes too); a day and month with no year are this
 * year's.
 *
 * Pure, so `node --experimental-strip-types` can test it. */
import { mentionedIn } from "./commentThreads.ts";

export interface Task {
  noteId: string;
  text: string;
  done: boolean;
  assignees: string[];
  /** yyyy-mm-dd, or null. */
  due: string | null;
}

interface TaskNode {
  type?: string;
  attrs?: { checked?: boolean };
  text?: string;
  content?: TaskNode[];
}

/** Every task in a document, in order: its own line, not its subtasks'. */
export function tasksIn(document: unknown): { text: string; done: boolean }[] {
  const found: { text: string; done: boolean }[] = [];
  const textOf = (node: TaskNode): string =>
    (node.text ?? "") + (node.content ?? []).map(textOf).join("");
  const visit = (node: TaskNode) => {
    if (node.type === "taskItem") {
      const line = (node.content ?? []).find((child) => child.type === "paragraph");
      const text = line ? textOf(line).trim() : "";
      if (text) found.push({ text, done: node.attrs?.checked === true });
    }
    (node.content ?? []).forEach(visit);
  };
  if (document && typeof document === "object") visit(document as TaskNode);
  return found;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dueOf(text: string, year: number): string | null {
  const iso = /(?:^|[^\d])(\d{4})-(\d{2})-(\d{2})(?!\d)/.exec(text);
  if (iso) return valid(+iso[1], +iso[2], +iso[3]);
  const day = /(?:^|[^\d/.])(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2}|\d{4}))?(?![\d/.])/.exec(text);
  if (!day) return null;
  const y = day[3] ? (day[3].length === 2 ? 2000 + +day[3] : +day[3]) : year;
  return valid(y, +day[2], +day[1]);
}

function valid(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** The open tasks that want this reader: handed to them by name, or — in a
 *  note of their own — given a date and nobody's name. Soonest first, the
 *  undated last. */
export function yourTasks(
  notes: { id: string; ownerId: string | null; content: unknown }[],
  members: { userId: string; name: string }[],
  selfId: string,
  today: Date,
): Task[] {
  const year = today.getFullYear();
  const tasks: Task[] = [];
  for (const note of notes) {
    for (const task of tasksIn(note.content)) {
      if (task.done) continue;
      const assignees = mentionedIn(task.text, members);
      const due = dueOf(task.text, year);
      const mine =
        assignees.includes(selfId) || (assignees.length === 0 && due && note.ownerId === selfId);
      if (mine) tasks.push({ noteId: note.id, text: task.text, done: false, assignees, due });
    }
  }
  return tasks.sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
}

/** Today in the same shape as a due date, by the reader's own clock. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
