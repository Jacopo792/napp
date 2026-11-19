/* The archive's own stickers: pictures its members import, still or moving,
 * shown to everyone in the archive and nobody else (`archive_stickers`).
 *
 * A pack file lives in `chat-media` as `<archive>/<id>.pack.<ext>`. Sending
 * one copies it beside the message as `<archive>/<message>.sticker.<ext>`,
 * so the message reads exactly when it is readable and survives the sticker
 * being taken out of the pack. Web and phone share every call here. */
import type { ChatSticker } from "./commentThreads";
import type { AppSession } from "./session";
import { fail, supabase } from "./supabaseClient";

const BUCKET = "chat-media";

/** What may be imported, by type, and the extension its file carries. */
export const STICKER_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
};

/** A sticker is small; a moving one still fits in a few megabytes. */
export const STICKER_MAX_BYTES = 4 * 1024 * 1024;

export interface PackSticker {
  id: string;
  ownerId: string;
  path: string;
  width: number;
  height: number;
}

const extensionOf = (path: string) => path.slice(path.lastIndexOf(".") + 1);

/** The archive's stickers, oldest first, as the reader may see them. */
export async function loadStickerPack(session: AppSession): Promise<PackSticker[]> {
  const { data, error } = await supabase
    .from("archive_stickers")
    .select("id, owner_id, path, width, height")
    .eq("archive_id", session.archiveId)
    .order("created_at");
  fail(error);
  return (data ?? []).map((row) => ({
    id: row.id as string,
    ownerId: row.owner_id as string,
    path: row.path as string,
    width: row.width as number,
    height: row.height as number,
  }));
}

/** Put one picture into the pack. The phone hands bytes, the browser a Blob. */
export async function addPackSticker(
  session: AppSession,
  data: Blob | ArrayBuffer,
  type: string,
  width: number,
  height: number,
  id: string = crypto.randomUUID(),
): Promise<PackSticker> {
  const extension = STICKER_TYPES[type];
  if (!extension) throw new Error("Stickers are PNG, WebP, GIF or JPEG pictures");
  const size = data instanceof Blob ? data.size : data.byteLength;
  if (size > STICKER_MAX_BYTES) throw new Error("A sticker can be up to 4 MB");
  const path = `${session.archiveId}/${id}.pack.${extension}`;
  const bucket = supabase.storage.from(BUCKET);
  fail((await bucket.upload(path, data, { contentType: type, upsert: false })).error);
  const sides = { width: Math.round(width), height: Math.round(height) };
  const { error } = await supabase
    .from("archive_stickers")
    .insert({ id, archive_id: session.archiveId, path, ...sides });
  if (error) {
    await bucket.remove([path]);
    fail(error);
  }
  return { id, ownerId: session.userId, path, ...sides };
}

/** Take one of your own stickers out of the pack; sent copies stay. */
export async function removePackSticker(sticker: PackSticker): Promise<void> {
  fail((await supabase.from("archive_stickers").delete().eq("id", sticker.id)).error);
  await supabase.storage.from(BUCKET).remove([sticker.path]);
}

/** Where a message's copy of a pack sticker lives. The database checks it. */
export const packCopyPath = (session: AppSession, messageId: string, sticker: PackSticker) =>
  `${session.archiveId}/${messageId}.sticker.${extensionOf(sticker.path)}`;

/** Copy a pack sticker beside the message about to be sent, and the
 *  `sticker` that message carries. */
export async function packStickerForMessage(
  session: AppSession,
  messageId: string,
  sticker: PackSticker,
): Promise<ChatSticker> {
  const path = packCopyPath(session, messageId, sticker);
  fail((await supabase.storage.from(BUCKET).copy(sticker.path, path)).error);
  return { pack: "own", sticker: sticker.id, path, width: sticker.width, height: sticker.height };
}
