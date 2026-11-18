import test from "node:test";
import assert from "node:assert/strict";
import { giphyMedia, giphySearch } from "./giphy.ts";

test("GIPHY search keeps only well-formed items and pages on", async () => {
  let asked: URL | undefined;
  const get = (async (url: URL) => {
    asked = url;
    return new Response(
      JSON.stringify({
        data: [
          { id: "abc123", title: "Cat", images: { fixed_width: { width: "200", height: "150" } } },
          { id: "../evil", title: "x", images: { fixed_width: { width: "200", height: "200" } } },
          { id: "nosize", title: "y", images: {} },
        ],
        pagination: { total_count: 60, count: 24, offset: 24 },
      }),
    );
  }) as unknown as typeof fetch;
  const found = await giphySearch("key", { type: "sticker", query: " cat ", offset: 24 }, get);
  assert.equal(asked?.pathname, "/v1/stickers/search");
  assert.equal(asked?.searchParams.get("q"), "cat");
  assert.deepEqual(found.items, [{ id: "abc123", title: "Cat", width: 200, height: 150 }]);
  assert.equal(found.next, 48);

  await giphySearch("key", { type: "gif", query: "", offset: 0 }, get);
  assert.equal(asked?.pathname, "/v1/gifs/trending");
});

test("GIPHY media fetches only GIPHY's own address for a valid id", async () => {
  const asked: string[] = [];
  const fetcher = (async (url: string) => {
    asked.push(url);
    return { bytes: Buffer.from("RIFF"), type: "image/webp", url };
  }) as never;
  await giphyMedia("abc123", fetcher);
  assert.deepEqual(asked, ["https://media.giphy.com/media/abc123/200w.webp"]);
  await assert.rejects(giphyMedia("a/../b", fetcher));
  await assert.rejects(giphyMedia("evil.com#", fetcher));
});
