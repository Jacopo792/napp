import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { createClient } from "@supabase/supabase-js";
import { readArchivePayloads, readArchiveRows } from "./archiveRead.ts";

const ARCHIVE = "11111111-1111-4111-8111-111111111111";
const idOf = (i: number) => `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`;
const rowsOf = (count: number) => Array.from({ length: count }, (_, i) => ({ id: idOf(i) }));

/** Exercise the real Supabase request builder without a server or credentials.
 * This endpoint models row caps and Content-Range, not RLS or SQL execution. */
function endpoint(
  rows: { id: string }[],
  options: {
    cap?: number;
    unknownCount?: boolean;
    before?: (url: URL, request: number) => void;
    fail?: (url: URL, request: number) => boolean;
  } = {},
) {
  const requests: URL[] = [];
  let active = 0;
  let maxActive = 0;
  const client = createClient("https://archive.example.invalid", "not-a-real-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        requests.push(url);
        const number = requests.length;
        assert.equal(url.searchParams.get("archive_id"), `eq.${ARCHIVE}`);
        assert.equal(url.searchParams.get("order"), "id.asc");
        assert.match(new Headers(init?.headers).get("prefer") ?? "", /count=exact/);
        options.before?.(url, number);
        active++;
        maxActive = Math.max(active, maxActive);
        await setImmediate();
        try {
          if (options.fail?.(url, number))
            return new Response(JSON.stringify({ message: "Read failed", code: "XX000" }), {
              status: 500,
            });
          let selected = [...rows].sort((a, b) => a.id.localeCompare(b.id));
          for (const filter of url.searchParams.getAll("id")) {
            if (filter.startsWith("gt."))
              selected = selected.filter((row) => row.id > filter.slice(3));
            else {
              assert.ok(filter.startsWith("in.("));
              const wanted = new Set(filter.slice(4, -1).split(","));
              selected = selected.filter((row) => wanted.has(row.id));
            }
          }
          const page = selected.slice(
            0,
            Math.min(Number(url.searchParams.get("limit")), options.cap ?? 1000),
          );
          const total = options.unknownCount ? "*" : selected.length;
          return new Response(JSON.stringify(page), {
            headers: {
              "content-type": "application/json",
              "content-range": `${page.length ? `0-${page.length - 1}` : "*"}/${total}`,
            },
          });
        } finally {
          active--;
        }
      },
    },
  });
  return { client, requests, maxActive: () => maxActive };
}

test("archive metadata is complete beyond the configured 1000-row API cap", async () => {
  const rows = rowsOf(2501);
  const api = endpoint(rows);
  assert.deepEqual(await readArchiveRows(api.client, "notes", "id", ARCHIVE), rows);
  assert.equal(api.requests.length, 6);
  assert.equal(api.maxActive(), 1);
});

test("lower server caps and an unavailable count cannot silently truncate folders", async () => {
  for (const unknownCount of [false, true]) {
    const rows = rowsOf(511);
    const api = endpoint(rows, { cap: 73, unknownCount });
    assert.deepEqual(await readArchiveRows(api.client, "folders", "id", ARCHIVE), rows);
    assert.equal(api.requests.length, unknownCount ? 8 : 7);
    assert.ok(api.requests.every((url) => url.pathname.endsWith("/folders")));
  }
});

test("a complete full page and an empty archive each need only one request", async () => {
  for (const count of [0, 500]) {
    const rows = rowsOf(count);
    const api = endpoint(rows);
    assert.deepEqual(await readArchiveRows(api.client, "notes", "id", ARCHIVE), rows);
    assert.equal(api.requests.length, 1);
  }
});

test("deleting an already-read row does not skip the next page's first note", async () => {
  const rows = rowsOf(1001);
  const original = [...rows];
  const api = endpoint(rows, {
    before: (_url, request) => {
      if (request === 2) rows.shift();
    },
  });
  assert.deepEqual(await readArchiveRows(api.client, "notes", "id", ARCHIVE), original);
});

test("an error on a later metadata page rejects instead of returning a partial archive", async () => {
  const api = endpoint(rowsOf(1001), { fail: (_url, request) => request === 2 });
  await assert.rejects(readArchiveRows(api.client, "notes", "id", ARCHIVE), /Read failed/);
  assert.equal(api.requests.length, 2);
});

test("cold payload reads bound UUID filters and traffic while retaining every note", async () => {
  const rows = rowsOf(2251);
  const api = endpoint(rows);
  const result = await readArchivePayloads(
    api.client,
    ARCHIVE,
    "id",
    rows.map((row) => row.id),
  );
  assert.deepEqual(result, rows);
  assert.equal(api.requests.length, 23);
  assert.equal(api.maxActive(), 2);
  assert.ok(api.requests.every((url) => url.href.length < 8000));
  assert.ok(
    api.requests.every((url) => url.searchParams.get("id")!.slice(4, -1).split(",").length <= 100),
  );
});

test("payload batches also paginate under smaller server caps and warm reads send nothing", async () => {
  const rows = rowsOf(333);
  const api = endpoint(rows, { cap: 17 });
  assert.deepEqual(await readArchivePayloads(api.client, ARCHIVE, "id", []), []);
  assert.equal(api.requests.length, 0);
  assert.deepEqual(
    await readArchivePayloads(
      api.client,
      ARCHIVE,
      "id",
      rows.map((row) => row.id),
    ),
    rows,
  );
  assert.equal(api.maxActive(), 2);
});

test("a failed payload batch stops later waves and reports failure", async () => {
  const rows = rowsOf(1001);
  const api = endpoint(rows, {
    fail: (url) => url.searchParams.getAll("id").some((filter) => filter.includes(idOf(100))),
  });
  await assert.rejects(
    readArchivePayloads(
      api.client,
      ARCHIVE,
      "id",
      rows.map((row) => row.id),
    ),
    /Read failed/,
  );
  await setImmediate();
  assert.equal(api.requests.length, 2);
});
