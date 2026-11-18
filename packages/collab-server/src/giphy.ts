/* GIPHY, read here for a member choosing a GIF or a sticker, so that neither
 * a viewer's address nor the API key ever reaches GIPHY from a client.
 *
 * Search and trending return only what the picker draws: an id, a title and
 * the size of the one rendition the app uses (200px wide, animated WebP).
 * The pictures come through `giphyMedia`, which builds GIPHY's address from a
 * validated id itself, so this endpoint can fetch nothing but GIPHY media. */
import { fetchPublic } from "./importImage.ts";

export interface GiphyItem {
  id: string;
  title: string;
  width: number;
  height: number;
}

const ID = /^[A-Za-z0-9]{1,64}$/;
const PAGE = 24;

export async function giphySearch(
  key: string,
  options: { type: "gif" | "sticker"; query: string; offset: number },
  get: typeof fetch = fetch,
): Promise<{ items: GiphyItem[]; next: number | null }> {
  const query = options.query.trim().slice(0, 50);
  const url = new URL(
    `https://api.giphy.com/v1/${options.type === "sticker" ? "stickers" : "gifs"}/${query ? "search" : "trending"}`,
  );
  url.searchParams.set("api_key", key);
  if (query) url.searchParams.set("q", query);
  url.searchParams.set("limit", String(PAGE));
  url.searchParams.set("offset", String(Math.max(0, Math.min(4999, Math.floor(options.offset)))));
  url.searchParams.set("rating", "pg-13");
  url.searchParams.set("bundle", "messaging_non_clips");
  const response = await get(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`GIPHY answered ${response.status}`);
  const body = (await response.json()) as {
    data?: {
      id?: string;
      title?: string;
      images?: { fixed_width?: { width?: string; height?: string } };
    }[];
    pagination?: { total_count?: number; count?: number; offset?: number };
  };
  const items = (body.data ?? []).flatMap((item) => {
    const size = item.images?.fixed_width;
    const width = Number(size?.width);
    const height = Number(size?.height);
    if (!item.id || !ID.test(item.id) || !(width > 0) || !(height > 0)) return [];
    return [{ id: item.id, title: (item.title ?? "").slice(0, 200), width, height }];
  });
  const { offset = 0, count = 0, total_count: total = 0 } = body.pagination ?? {};
  return { items, next: offset + count < total && count > 0 ? offset + count : null };
}

/** The 200px animated WebP of one GIF or sticker. */
export async function giphyMedia(
  id: string,
  fetcher: typeof fetchPublic = fetchPublic,
): Promise<{ bytes: Buffer; type: string }> {
  if (!ID.test(id)) throw new Error("Not a GIPHY id");
  const found = await fetcher(
    `https://media.giphy.com/media/${id}/200w.webp`,
    ["image/webp"],
    8 * 1024 * 1024,
  );
  if (found.type !== "image/webp") throw new Error("Not a WebP");
  return { bytes: found.bytes, type: found.type };
}
