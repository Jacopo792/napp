import type { SupabaseClient } from "@supabase/supabase-js";

const PAGE_SIZE = 500;
const PAYLOAD_BATCH = 100;

/** Keyset pagination keeps a large archive from being silently truncated by
 * PostgREST's row limit. The exact count describes the remaining filtered
 * rows, so even a server cap below PAGE_SIZE cannot look like the last page.
 * IDs are immutable; a deletion cannot shift an offset past unread notes. */
export async function readArchiveRows<T extends { id: string }>(
  client: SupabaseClient,
  table: "notes" | "folders",
  columns: string,
  archiveId: string,
  ids?: readonly string[],
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    let query = client
      .from(table)
      .select(columns, { count: "exact" })
      .eq("archive_id", archiveId)
      .order("id")
      .limit(PAGE_SIZE);
    if (after) query = query.gt("id", after);
    if (ids) query = query.in("id", ids);
    const { data, error, count } = await query;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as T[];
    if (!page.length) return rows;
    const next = page[page.length - 1].id;
    if (after && next <= after) throw new Error("Archive pagination did not advance");
    rows.push(...page);
    if (count !== null && page.length >= count) return rows;
    after = next;
  }
}

/** Keep UUID filters below ordinary URL limits and cold-load traffic bounded
 * to two requests at once. Warm archives pass no IDs and make no requests. */
export async function readArchivePayloads<T extends { id: string }>(
  client: SupabaseClient,
  archiveId: string,
  columns: string,
  ids: readonly string[],
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < ids.length; from += PAYLOAD_BATCH * 2) {
    const batches = [
      ids.slice(from, from + PAYLOAD_BATCH),
      ids.slice(from + PAYLOAD_BATCH, from + PAYLOAD_BATCH * 2),
    ].filter((batch) => batch.length);
    const pages = await Promise.all(
      batches.map((batch) => readArchiveRows<T>(client, "notes", columns, archiveId, batch)),
    );
    for (const page of pages) rows.push(...page);
  }
  return rows;
}
