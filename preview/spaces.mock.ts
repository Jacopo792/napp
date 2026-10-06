/* Spaces against memory: the preview archive and a second one, so the switcher
   has somewhere to go and the archive sheet has seats to count. Each archive
   has its own notes in supabase.mock.ts — the fixture is the first one's, and
   every other archive opens empty. */
import type { AppSession } from "./session.mock";
import { PREVIEW_ARCHIVE, PREVIEW_THESIS, PREVIEW_U1, PREVIEW_U2 } from "./fixture";
import type { Space } from "@/lib/spaces";
import { DEFAULT_FEATURES, type ArchiveKind, type DocumentFeatures } from "@/lib/spaceShape";

export type { ArchiveKind, Space, SpaceMember, DocumentFeatures } from "@/lib/spaces";
export { archiveKind, documentFeatures } from "@/lib/spaceShape";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const spaces: Space[] = [
  {
    archiveId: PREVIEW_ARCHIVE,
    name: "Preview archive",
    seatLimit: 2,
    kind: "notes",
    features: { ...DEFAULT_FEATURES },
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
  return spaces.find((space) => space.archiveId === archiveId)?.seatLimit ?? 2;
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
}

export async function setDocumentFeatures(
  session: AppSession,
  features: DocumentFeatures,
): Promise<void> {
  await mergeSpaceSettings(session, { features });
}

export async function deleteSpace(session: AppSession): Promise<void> {
  await sleep(150);
  const index = spaces.findIndex((one) => one.archiveId === session.archiveId);
  if (index < 0) throw new Error("You are not in this archive");
  if (spaces[index].members.length > 1) throw new Error("Somebody else is still in this archive");
  if (spaces.length === 1) throw new Error("This is your only archive");
  spaces.splice(index, 1);
}
