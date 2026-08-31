/* One answer to "may this connection do this, now".
 *
 * Authorising once, at the handshake, is not enough for a socket that stays
 * open for hours. A member can be removed, an editor demoted to viewer, a note
 * put in the trash, an archived note hidden by its owner — and none of those
 * reaches a connection that was authorised last Tuesday. So the same function
 * runs at the handshake, again whenever the client hands over a refreshed
 * token, and again before an update is applied.
 *
 * "Before an update is applied" would be a database round trip per keystroke,
 * which is why the answer is cached for a short, configurable while. The TTL is
 * the delay between losing access and being cut off: a few seconds is short
 * enough to be a boundary and long enough to be free. */
import type { SupabaseClient } from "@supabase/supabase-js";
import { collaborationColor } from "../../src/features/editor/lib/ydoc.ts";
import { decideAccess, type NoteRow } from "./access.ts";

export interface Identity {
  userId: string;
  /** The nickname on the account's own profile row, never what a client says. */
  name: string;
  /** Assigned here, from the account id, so every peer sees the same colour. */
  color: string;
}

export type Authorization =
  | { allowed: false; reason: string }
  | { allowed: true; readOnly: boolean; archiveId: string; identity: Identity };

/** Everything one authorisation needs from the archive, read as the caller.
 *  Returning `null` means the token itself is no good. */
export type Lookup = (
  token: string,
  noteId: string,
) => Promise<{
  userId: string;
  note: NoteRow | null;
  role: string | null;
  nickname: string;
} | null>;

export type Authorizer = (
  token: string,
  noteId: string,
  options?: { fresh?: boolean },
) => Promise<Authorization>;

/** Past this many entries the cache is swept before it is added to. A socket
 *  holds one note, so this is generous for a single instance. */
const SWEEP_ABOVE = 256;

export function createAuthorizer(
  lookup: Lookup,
  options: { ttl?: number; now?: () => number } = {},
): Authorizer {
  const ttl = options.ttl ?? 5000;
  const now = options.now ?? Date.now;
  const answers = new Map<string, { at: number; answer: Authorization }>();

  return async function authorize(token, noteId, { fresh = false } = {}) {
    const key = `${token} ${noteId}`;
    const at = now();

    if (!fresh) {
      const cached = answers.get(key);
      if (cached && at - cached.at < ttl) return cached.answer;
    }

    let answer: Authorization;
    try {
      const found = await lookup(token, noteId);
      if (!found) {
        answer = { allowed: false, reason: "Sign in again" };
      } else {
        const access = decideAccess(found.note, found.role);
        answer = access.allowed
          ? {
              allowed: true,
              readOnly: access.readOnly,
              archiveId: access.archiveId,
              identity: {
                userId: found.userId,
                name: found.nickname || "Someone",
                color: collaborationColor(found.userId),
              },
            }
          : { allowed: false, reason: access.reason };
      }
    } catch (error) {
      /* The archive could not be asked. Refusing is the safe answer, and it is
         deliberately not cached: a database hiccup should not lock somebody out
         for the whole TTL. */
      return { allowed: false, reason: error instanceof Error ? error.message : "Try again" };
    }

    if (answers.size > SWEEP_ABOVE) {
      for (const [stale, entry] of answers) {
        if (at - entry.at >= ttl) answers.delete(stale);
      }
    }
    answers.set(key, { at, answer });
    return answer;
  };
}

/** The archive, read through the caller's own token so row level security
 *  answers this server exactly as it answers the browser. */
export function supabaseLookup(asCaller: (token: string) => SupabaseClient): Lookup {
  return async (token, noteId) => {
    const caller = asCaller(token);
    const identity = await caller.auth.getUser(token);
    if (identity.error || !identity.data?.user) return null;
    const userId = identity.data.user.id;

    const note = await caller
      .from("notes")
      .select("id, archive_id, trashed_at")
      .eq("id", noteId)
      .maybeSingle();
    if (note.error) throw new Error(note.error.message);
    const row = (note.data as NoteRow | null) ?? null;

    const [membership, profile] = await Promise.all([
      row
        ? caller
            .from("archive_members")
            .select("role")
            .eq("archive_id", row.archive_id)
            .eq("user_id", userId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      caller.from("profiles").select("nickname").eq("user_id", userId).maybeSingle(),
    ]);
    if (membership.error) throw new Error(membership.error.message);

    return {
      userId,
      note: row,
      role: (membership.data as { role: string } | null)?.role ?? null,
      nickname: (profile.data as { nickname: string | null } | null)?.nickname ?? "",
    };
  };
}
