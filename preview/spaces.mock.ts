/* Spaces against memory: the preview archive and a second one, so the switcher
   has somewhere to go and the archive sheet has seats to count. Switching
   reopens the same fixture — the preview has one archive's worth of notes. */
import type { AppSession } from "./session.mock";
import { PREVIEW_U1, PREVIEW_U2 } from "./fixture";
import type { Space } from "@/lib/spaces";

export type { Space, SpaceMember } from "@/lib/spaces";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const spaces: Space[] = [
  {
    archiveId: "00000000-0000-4000-8000-000000000001",
    name: "Preview archive",
    seatLimit: 2,
    members: [
      { userId: PREVIEW_U1, nickname: "Preview", avatarObject: null },
      { userId: PREVIEW_U2, nickname: "Partner", avatarObject: null },
    ],
  },
  {
    archiveId: "00000000-0000-4000-8000-000000000002",
    name: "Study group",
    seatLimit: 5,
    members: [
      { userId: PREVIEW_U1, nickname: "Preview", avatarObject: null },
      { userId: "preview-member-3", nickname: "Giulia", avatarObject: null },
      { userId: "preview-member-4", nickname: "Marco", avatarObject: null },
    ],
  },
];

export async function loadSpaces(_session: AppSession): Promise<Space[]> {
  await sleep(120);
  return spaces.map((space) => ({ ...space, members: [...space.members] }));
}

export async function createSpace(name: string): Promise<string> {
  await sleep(150);
  const archiveId = crypto.randomUUID();
  spaces.push({
    archiveId,
    name: name.trim(),
    seatLimit: 2,
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
