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

export interface SpaceMember {
  userId: string;
  nickname: string;
  avatarObject: string | null;
}

export interface Space {
  archiveId: string;
  name: string;
  seatLimit: number;
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
    supabase.from("archives").select("id, name, seat_limit").in("id", ids),
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
    ((archives.data ?? []) as { id: string; name: string; seat_limit: number }[]).map((row) => [
      row.id,
      row,
    ]),
  );
  return ids.flatMap((archiveId) => {
    const archive = byId.get(archiveId);
    if (!archive) return [];
    return [
      {
        archiveId,
        name: archive.name,
        seatLimit: archive.seat_limit,
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

export async function createSpace(name: string): Promise<string> {
  const result = await supabase.rpc("create_archive", { archive_name: name });
  fail(result.error);
  if (typeof result.data !== "string") throw new Error("The archive could not be made");
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
