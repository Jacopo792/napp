/* The archive's own stickers, kept in memory: two of the fixture's drawings
   to start with, one of them yours so removing can be tried. */
import type { ChatSticker } from "@/lib/commentThreads";
import type { AppSession } from "@/lib/session";
import { STICKERS, stickerUrl } from "@/lib/stickers";
import { mediaUrls } from "./comments.mock.ts";

export const STICKER_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
};
export const STICKER_MAX_BYTES = 4 * 1024 * 1024;

export interface PackSticker {
  id: string;
  ownerId: string;
  path: string;
  width: number;
  height: number;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

let pack: PackSticker[] | null = null;
function seeded(session: AppSession): PackSticker[] {
  if (pack) return pack;
  pack = [STICKERS[3]!.id, STICKERS[9]!.id].map((id, at) => {
    const path = `${session.archiveId}/pack-${at}.pack.png`;
    mediaUrls.set(path, stickerUrl(id)!);
    return { id: `pack-${at}`, ownerId: at ? session.userId : "someone-else", path, width: 216, height: 216 };
  });
  return pack;
}

export async function loadStickerPack(session: AppSession): Promise<PackSticker[]> {
  await sleep(150);
  return [...seeded(session)];
}

export async function addPackSticker(
  session: AppSession,
  data: Blob | ArrayBuffer,
  type: string,
  width: number,
  height: number,
): Promise<PackSticker> {
  await sleep(300);
  const id = crypto.randomUUID();
  const path = `${session.archiveId}/${id}.pack.${type.split("/")[1]}`;
  mediaUrls.set(path, URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type })));
  const sticker = { id, ownerId: session.userId, path, width, height };
  seeded(session).push(sticker);
  return sticker;
}

export async function removePackSticker(sticker: PackSticker): Promise<void> {
  await sleep(150);
  pack = (pack ?? []).filter((one) => one.id !== sticker.id);
}

export const packCopyPath = (session: AppSession, messageId: string, sticker: PackSticker) =>
  `${session.archiveId}/${messageId}.sticker.${sticker.path.slice(sticker.path.lastIndexOf(".") + 1)}`;

export async function packStickerForMessage(
  session: AppSession,
  messageId: string,
  sticker: PackSticker,
): Promise<ChatSticker> {
  await sleep(150);
  const path = packCopyPath(session, messageId, sticker);
  mediaUrls.set(path, mediaUrls.get(sticker.path)!);
  return { pack: "own", sticker: sticker.id, path, width: sticker.width, height: sticker.height };
}
