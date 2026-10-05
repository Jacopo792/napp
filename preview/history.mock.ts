/* Versions against an in-memory archive, so the history panel can be opened,
   named into and restored from with no network. The fixture's notes are
   seeded with a few stretches by both members; a note made in the preview, in
   any archive, starts with no history, as it would. */
import type { AppSession } from "./session.mock";
import { FIXTURE_NOTES, PREVIEW_ARCHIVE, PREVIEW_U1, PREVIEW_U2 } from "./fixture";
import type { Contribution, FolderVersion, NoteVersion, VersionBody } from "@/lib/history";

type JSONContent = VersionBody["content"];

export type { Contribution, FolderVersion, NoteVersion, VersionBody } from "@/lib/history";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lists = new Map<string, NoteVersion[]>();
const bodies = new Map<string, { title: string; content: JSONContent }>();

const doc = (...paragraphs: string[]): JSONContent => ({
  type: "doc",
  content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
});

function seed(noteId: string): NoteVersion[] {
  const existing = lists.get(noteId);
  if (existing) return existing;
  if (!FIXTURE_NOTES.some((note) => note.id === noteId)) {
    const empty: NoteVersion[] = [];
    lists.set(noteId, empty);
    return empty;
  }
  const hour = 3_600_000;
  const stages = [
    { ago: 30 * hour, authors: [PREVIEW_U1], added: null, removed: null, label: null,
      words: ["Il pensiero militante nasce con Paolo."] },
    { ago: 26 * hour, authors: [PREVIEW_U2], added: 9, removed: 0, label: null,
      words: ["Il pensiero militante nasce con Paolo.", "La rivelazione diventa un programma."] },
    { ago: 5 * hour, authors: [PREVIEW_U1, PREVIEW_U2], added: 14, removed: 3, label: "Inviata alla relatrice",
      words: ["Il pensiero militante, insieme fascinoso e orribile, nasce con Paolo.", "La rivelazione diventa un programma politico."] },
    { ago: hour / 3, authors: [PREVIEW_U2], added: 6, removed: 1, label: null,
      words: ["Il pensiero militante, insieme fascinoso e orribile, nasce con Paolo.", "La rivelazione diventa un programma politico, e Paolo il suo Lenin."] },
  ];
  const list = stages
    .map((stage, index) => {
      const id = `${noteId}-v${index}`;
      bodies.set(id, { title: "Paolo. Lenin del passato", content: doc(...stage.words) });
      return {
        id,
        createdAt: new Date(Date.now() - stage.ago).toISOString(),
        authorIds: stage.authors,
        title: "Paolo. Lenin del passato",
        label: stage.label,
        wordsAdded: stage.added,
        wordsRemoved: stage.removed,
      };
    })
    .reverse();
  lists.set(noteId, list);
  return list;
}

export async function loadVersions(_session: AppSession, noteId: string): Promise<NoteVersion[]> {
  await sleep(150);
  return [...seed(noteId)];
}

export async function loadVersionContent(versionId: string) {
  await sleep(80);
  const body = bodies.get(versionId);
  if (!body) throw new Error("That version is gone");
  return body;
}

export async function nameVersion(
  session: AppSession,
  noteId: string,
  label: string,
  current: { title: string; content: JSONContent },
): Promise<NoteVersion> {
  await sleep(120);
  const version: NoteVersion = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    authorIds: [session.userId],
    title: current.title,
    label: label.trim(),
    wordsAdded: null,
    wordsRemoved: null,
  };
  bodies.set(version.id, current);
  seed(noteId).unshift(version);
  return version;
}

/** A week of somebody's work spread over the fixture's notes, so the person
 *  sheet has days and notes to group. */
export async function loadContributions(session: AppSession, userId: string): Promise<Contribution[]> {
  await sleep(180);
  if (session.archiveId !== PREVIEW_ARCHIVE) return [];
  const hour = 3_600_000;
  const notes = FIXTURE_NOTES.slice(0, 5);
  const shift = userId === PREVIEW_U1 ? 1 : 0;
  const out: Contribution[] = [];
  for (let index = 0; index < 14; index++) {
    const note = notes[(index + shift) % notes.length];
    out.push({
      id: `${userId}-c${index}`,
      noteId: note.id,
      createdAt: new Date(Date.now() - (index * 9 + 1) * hour).toISOString(),
      label: index === 4 ? "Inviata alla relatrice" : null,
      wordsAdded: 20 + ((index * 37) % 140),
      wordsRemoved: (index * 11) % 30,
    });
  }
  return out;
}

export async function loadFolderVersions(_session: AppSession, noteIds: string[]): Promise<FolderVersion[]> {
  await sleep(160);
  return noteIds
    .slice(0, 6)
    .flatMap((noteId) => seed(noteId).map((version) => ({ ...version, noteId })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
