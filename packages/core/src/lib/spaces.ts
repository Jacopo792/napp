/* The archives an account belongs to — its spaces — and the few things done
 * to one as a whole: making a new one, naming it, giving it seats.
 *
 * Membership is still the only boundary. Everything here is read under the
 * caller's own row level security, so the faces of an archive are only ever
 * those of archives the caller is in; making one goes through
 * `create_archive`, because a new archive has no member yet for a policy to
 * recognise. Switching is `chooseArchive` in `session.ts`, which checks the
 * membership again before it stores anything. */
import type { AppSession } from "./sessionRestore";
import { fail, supabase } from "./supabaseClient";
import {
  archiveKind,
  documentFeatures,
  pageSetup,
  type ArchiveKind,
  type DocumentFeatures,
  type PageSetup,
} from "./spaceShape";

export {
  archiveKind,
  documentFeatures,
  pageSetup,
  type ArchiveKind,
  type DocumentFeatures,
  type PageSetup,
};

export interface SpaceMember {
  userId: string;
  nickname: string;
  avatarObject: string | null;
}

export interface Space {
  archiveId: string;
  name: string;
  seatLimit: number;
  kind: ArchiveKind;
  features: DocumentFeatures;
  page: PageSetup;
  members: SpaceMember[];
}

export async function loadSpaces(session: AppSession): Promise<Space[]> {
  const mine = await supabase
    .from("archive_members")
    .select("archive_id")
    .eq("user_id", session.userId)
    .order("created_at");
  fail(mine.error);
  const ids = ((mine.data ?? []) as { archive_id: string }[]).map((row) => row.archive_id);
  if (ids.length === 0) return [];

  const [archives, members] = await Promise.all([
    supabase.from("archives").select("id, name, seat_limit, kind, settings").in("id", ids),
    supabase
      .from("archive_members")
      .select("archive_id, user_id")
      .in("archive_id", ids)
      .order("created_at"),
  ]);
  fail(archives.error);
  fail(members.error);
  const memberRows = (members.data ?? []) as { archive_id: string; user_id: string }[];
  const profiles = await supabase
    .from("profiles")
    .select("user_id, nickname, avatar_object")
    .in("user_id", [...new Set(memberRows.map((row) => row.user_id))]);
  // A missing name never hides an archive; the face falls back to an initial.
  const profileOf = new Map(
    (
      (profiles.data ?? []) as {
        user_id: string;
        nickname: string | null;
        avatar_object: string | null;
      }[]
    ).map((row) => [row.user_id, row]),
  );
  const byId = new Map(
    (
      (archives.data ?? []) as {
        id: string;
        name: string;
        seat_limit: number;
        kind: string;
        settings: unknown;
      }[]
    ).map((row) => [row.id, row]),
  );
  return ids.flatMap((archiveId) => {
    const archive = byId.get(archiveId);
    if (!archive) return [];
    return [
      {
        archiveId,
        name: archive.name,
        seatLimit: archive.seat_limit,
        kind: archiveKind(archive.kind),
        features: documentFeatures(archive.settings),
        page: pageSetup(archive.settings),
        members: memberRows
          .filter((row) => row.archive_id === archiveId)
          .map((row) => ({
            userId: row.user_id,
            nickname: profileOf.get(row.user_id)?.nickname ?? "",
            avatarObject: profileOf.get(row.user_id)?.avatar_object ?? null,
          })),
      },
    ];
  });
}

/** Made, then given its options. Two calls rather than a wider
 *  `create_archive`: the options are `settings`, which the archive's own
 *  member writes like any other time, under the same policy. */
export async function createSpace(
  name: string,
  kind: ArchiveKind = "notes",
  features?: DocumentFeatures,
): Promise<string> {
  const result = await supabase.rpc("create_archive", { archive_name: name, archive_kind: kind });
  fail(result.error);
  if (typeof result.data !== "string") throw new Error("The archive could not be made");
  if (features) {
    const merged = await supabase.rpc("merge_archive_settings", {
      target_archive_id: result.data,
      patch: { features },
    });
    fail(merged.error);
  }
  return result.data;
}

export async function renameSpace(session: AppSession, name: string): Promise<void> {
  const trimmed = name.trim().slice(0, 80);
  if (!trimmed) throw new Error("An archive needs a name");
  const result = await supabase
    .from("archives")
    .update({ name: trimmed })
    .eq("id", session.archiveId);
  fail(result.error);
}

/** The database refuses a limit under the members already there, and outside
 *  one to eight. */
export async function setSpaceSeats(session: AppSession, seats: number): Promise<void> {
  const result = await supabase
    .from("archives")
    .update({ seat_limit: seats })
    .eq("id", session.archiveId);
  fail(result.error);
}

export async function setSpaceKind(session: AppSession, kind: ArchiveKind): Promise<void> {
  const result = await supabase.from("archives").update({ kind }).eq("id", session.archiveId);
  fail(result.error);
}

/** One key of `archives.settings` changed, the rest left as they are. */
export async function mergeSpaceSettings(
  session: AppSession,
  patch: Record<string, unknown>,
): Promise<void> {
  const result = await supabase.rpc("merge_archive_settings", {
    target_archive_id: session.archiveId,
    patch,
  });
  fail(result.error);
}

/** The whole of `features`, because `||` merges one level deep: a patch of
 *  one switch would replace the object and take the others with it. */
export async function setDocumentFeatures(
  session: AppSession,
  features: DocumentFeatures,
): Promise<void> {
  await mergeSpaceSettings(session, { features });
}

export async function setPageSetup(session: AppSession, page: PageSetup): Promise<void> {
  await mergeSpaceSettings(session, { page });
}

/** Gone for good: only by its last member, never an account's last archive.
 *  Postgres decides (`archive_deletion_refusal`); the pictures are removed in
 *  between, because Storage refuses a delete made from SQL — and only once
 *  the answer is yes, so a refused delete never costs an archive its images. */
export async function deleteSpace(archiveId: string): Promise<void> {
  const refusal = await supabase.rpc("archive_deletion_refusal", {
    target_archive_id: archiveId,
  });
  fail(refusal.error);
  if (typeof refusal.data === "string") throw new Error(refusal.data);

  const bucket = supabase.storage.from("note-images");
  for (;;) {
    const listed = await bucket.list(archiveId, { limit: 1000 });
    fail(listed.error);
    const names = (listed.data ?? []).map((object) => `${archiveId}/${object.name}`);
    if (names.length === 0) break;
    const removed = await bucket.remove(names);
    fail(removed.error);
  }

  const result = await supabase.rpc("delete_archive", { target_archive_id: archiveId });
  fail(result.error);
}

export interface FarNote {
  archiveId: string;
  noteId: string;
  title: string;
  updatedAt: string;
}

/** Notes in the caller's other archives whose title holds `query` — titles
 *  only, because the rest of another archive is not in memory and is not
 *  worth a request per keystroke. Row level security decides which archives
 *  answer; the list only says which ones to ask.
 *  ponytail: `ilike` does not fold accents, so "perche" misses "perché" here
 *  while it finds it in this archive; `unaccent` in a view if that matters. */
export async function findInOtherArchives(archiveIds: string[], query: string): Promise<FarNote[]> {
  if (archiveIds.length === 0) return [];
  const pattern = `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
  const result = await supabase
    .from("notes")
    .select("id, archive_id, title, updated_at")
    .in("archive_id", archiveIds)
    .is("trashed_at", null)
    .ilike("title", pattern)
    .order("updated_at", { ascending: false })
    .limit(20);
  fail(result.error);
  return (
    (result.data ?? []) as { id: string; archive_id: string; title: string; updated_at: string }[]
  ).map((row) => ({
    archiveId: row.archive_id,
    noteId: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  }));
}
