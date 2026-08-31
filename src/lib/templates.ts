import {
  legacyMarkdownToRichText,
  richTextToPlainText,
  RICH_TEXT_VERSION,
} from "../features/editor/lib/content.ts";
import type { Note, NoteTemplate } from "./types.ts";

interface BuiltInSeed {
  id: string;
  name: string;
  description: string;
  title: string;
  body: string;
  icon: string;
}

const BUILT_IN_SEEDS: BuiltInSeed[] = [
  {
    id: "daily-note",
    name: "Daily note",
    description: "Priorities, notes and a short reflection.",
    title: "Daily note",
    icon: "☀️",
    body: "## Priorities\n\n- [ ] \n\n## Notes\n\n\n## Reflection\n\n",
  },
  {
    id: "study-notes",
    name: "Study notes",
    description: "Concepts, questions and a final summary.",
    title: "Study notes",
    icon: "📚",
    body: "## Topic\n\n## Key concepts\n\n- \n\n## Questions\n\n- [ ] \n\n## Summary\n\n",
  },
  {
    id: "meeting-notes",
    name: "Meeting notes",
    description: "Agenda, decisions and follow-up actions.",
    title: "Meeting notes",
    icon: "🗓️",
    body: "## Agenda\n\n- \n\n## Notes\n\n\n## Decisions\n\n- \n\n## Actions\n\n- [ ] ",
  },
  {
    id: "project-checklist",
    name: "Project checklist",
    description: "Outcome, milestones and open questions.",
    title: "Project checklist",
    icon: "🎯",
    body: "## Outcome\n\n## Milestones\n\n- [ ] \n- [ ] \n- [ ] \n\n## Open questions\n\n- ",
  },
];

export const BUILT_IN_TEMPLATES: NoteTemplate[] = BUILT_IN_SEEDS.map((seed) => ({
  id: seed.id,
  archiveId: null,
  createdBy: null,
  name: seed.name,
  description: seed.description,
  title: seed.title,
  content: legacyMarkdownToRichText(seed.body),
  pageIcon: { kind: "emoji", value: seed.icon },
  cover: null,
  createdAt: null,
  updatedAt: null,
  builtIn: true,
}));

export function instantiateTemplate(
  template: NoteTemplate | null,
  ownerId: string,
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): Note {
  const content = template
    ? structuredClone(template.content)
    : { type: "doc", content: [{ type: "paragraph" }] };
  return {
    id,
    title: template?.title ?? "",
    body: richTextToPlainText(content),
    content,
    contentVersion: RICH_TEXT_VERSION,
    legacyBody: null,
    pageIcon: template ? structuredClone(template.pageIcon) : null,
    cover: template ? structuredClone(template.cover) : null,
    ownerId,
    createdAt: now,
    updatedAt: now,
  };
}

export function templateFromNote(
  note: Note,
  name: string,
  description: string,
  archiveId: string,
  createdBy: string,
  now = new Date().toISOString(),
  id: string = crypto.randomUUID(),
): NoteTemplate {
  return {
    id,
    archiveId,
    createdBy,
    name: name.trim(),
    description: description.trim(),
    title: note.title,
    content: structuredClone(note.content),
    pageIcon: structuredClone(note.pageIcon),
    cover: structuredClone(note.cover),
    createdAt: now,
    updatedAt: now,
    builtIn: false,
  };
}
