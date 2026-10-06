/* Spaces against memory: the preview archive and a second one, so the switcher
   has somewhere to go and the archive sheet has seats to count. Each archive
   has its own notes in supabase.mock.ts — the fixture is the first one's, and
   every other archive opens empty. */
import type { AppSession } from "./session.mock";
import {
  FIXTURE_NOTES,
  PREVIEW_ARCHIVE,
  PREVIEW_THESIS,
  PREVIEW_U1,
  PREVIEW_U2,
  THESIS_NOTES,
} from "./fixture";
import type { FarNote, Space } from "@/lib/spaces";
import {
  DEFAULT_FEATURES,
  DEFAULT_PAGE,
  type ArchiveKind,
  type DocumentFeatures,
  type PageSetup,
} from "@/lib/spaceShape";

export type {
  ArchiveKind,
  FarNote,
  Space,
  SpaceMember,
  DocumentFeatures,
  PageSetup,
} from "@/lib/spaces";
export { archiveKind, documentFeatures, pageSetup } from "@/lib/spaceShape";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const spaces: Space[] = [
  {
    archiveId: PREVIEW_ARCHIVE,
    name: "Preview archive",
    seatLimit: 2,
    kind: "notes",
    features: { ...DEFAULT_FEATURES },
    page: { ...DEFAULT_PAGE },
    members: [
      { userId: PREVIEW_U1, nickname: "Preview", avatarObject: null },
      { userId: PREVIEW_U2, nickname: "Partner", avatarObject: null },
    ],
  },
  {
    archiveId: "00000000-0000-4000-8000-000000000002",
    name: "Study group",
    seatLimit: 5,
    kind: "notes",
    features: { ...DEFAULT_FEATURES },
    page: { ...DEFAULT_PAGE },
    members: [
      { userId: PREVIEW_U1, nickname: "Preview", avatarObject: null },
      { userId: "preview-member-3", nickname: "Giulia", avatarObject: null },
      { userId: "preview-member-4", nickname: "Marco", avatarObject: null },
    ],
  },
  {
    archiveId: PREVIEW_THESIS,
    name: "Tesi — Plotino",
    seatLimit: 2,
    kind: "document",
    features: {
      manuscript: "shared",
      numbering: true,
      footnotes: true,
      citations: true,
      review: true,
      wordGoal: 40000,
    },
    page: { ...DEFAULT_PAGE },
    members: [
      { userId: PREVIEW_U1, nickname: "Preview", avatarObject: null },
      { userId: PREVIEW_U2, nickname: "Partner", avatarObject: null },
    ],
  },
];

/** The roster supabase.mock.ts hands `loadArchive`, so the archive sheet and
 *  the people shelf name the same people. */
export function spaceMembers(archiveId: string): Space["members"] {
  return (spaces.find((space) => space.archiveId === archiveId)?.members ?? []).map(
    (member) => ({ ...member }),
  );
}

export function spaceSeats(archiveId: string): number {
  return spaces.find((space) => space.archiveId === archiveId)?.seatLimit ?? 8;
}

export async function loadSpaces(_session: AppSession): Promise<Space[]> {
  await sleep(120);
  return spaces.map((space) => ({ ...space, members: [...space.members] }));
}

export async function createSpace(
  name: string,
  kind: ArchiveKind = "notes",
  features: DocumentFeatures = DEFAULT_FEATURES,
): Promise<string> {
  await sleep(150);
  const archiveId = crypto.randomUUID();
  spaces.push({
    archiveId,
    name: name.trim(),
    seatLimit: 2,
    kind,
    features: { ...features },
    page: { ...DEFAULT_PAGE },
    members: [{ userId: PREVIEW_U1, nickname: "Preview", avatarObject: null }],
  });
  return archiveId;
}

export async function renameSpace(session: AppSession, name: string): Promise<void> {
  await sleep(100);
  const space = spaces.find((one) => one.archiveId === session.archiveId);
  if (space) space.name = name.trim();
}

export async function setSpaceSeats(session: AppSession, seats: number): Promise<void> {
  await sleep(100);
  const space = spaces.find((one) => one.archiveId === session.archiveId);
  if (!space) return;
  if (seats < space.members.length) throw new Error("There are more members than that");
  space.seatLimit = seats;
}

export async function setSpaceKind(session: AppSession, kind: ArchiveKind): Promise<void> {
  await sleep(100);
  const space = spaces.find((one) => one.archiveId === session.archiveId);
  if (space) space.kind = kind;
}

export async function mergeSpaceSettings(
  session: AppSession,
  patch: Record<string, unknown>,
): Promise<void> {
  await sleep(100);
  const space = spaces.find((one) => one.archiveId === session.archiveId);
  if (space && patch.features) space.features = { ...(patch.features as DocumentFeatures) };
  if (space && patch.page) space.page = { ...(patch.page as PageSetup) };
}

export async function setDocumentFeatures(
  session: AppSession,
  features: DocumentFeatures,
): Promise<void> {
  await mergeSpaceSettings(session, { features });
}

export async function setPageSetup(session: AppSession, page: PageSetup): Promise<void> {
  await mergeSpaceSettings(session, { page });
}

export async function deleteSpace(archiveId: string): Promise<void> {
  await sleep(150);
  const index = spaces.findIndex((one) => one.archiveId === archiveId);
  if (index < 0) throw new Error("You are not in this archive");
  if (spaces[index].members.length > 1) throw new Error("Somebody else is still in this archive");
  if (spaces.length === 1) throw new Error("This is your only archive");
  spaces.splice(index, 1);
}

/* The titles the fixture opened with — a note written in the preview since is
   not found from another archive, which is a smaller lie than a second store. */
export async function findInOtherArchives(archiveIds: string[], query: string): Promise<FarNote[]> {
  await sleep(160);
  const wanted = query.toLowerCase();
  return [
    ...FIXTURE_NOTES.map((note) => ({ note, archiveId: PREVIEW_ARCHIVE })),
    ...THESIS_NOTES.map((note) => ({ note, archiveId: PREVIEW_THESIS })),
  ]
    .filter(({ note, archiveId }) => archiveIds.includes(archiveId) && note.title.toLowerCase().includes(wanted))
    .slice(0, 20)
    .map(({ note, archiveId }) => ({
      archiveId,
      noteId: note.id,
      title: note.title,
      updatedAt: note.updatedAt,
    }));
}
