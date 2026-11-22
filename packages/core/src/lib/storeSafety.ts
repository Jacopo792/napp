import { supabase } from "./supabaseClient";

export const REPORT_REASONS = [
  { value: "child_safety", label: "Child sexual abuse or exploitation" },
  { value: "harassment", label: "Harassment or bullying" },
  { value: "sexual_content", label: "Sexual or exploitative content" },
  { value: "hate", label: "Hateful content" },
  { value: "violence", label: "Threats or violence" },
  { value: "illegal", label: "Illegal content or rights infringement" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export const BLOCK_CONSEQUENCES =
  "You'll stop seeing each other's notes, comments, messages and presence, and they can't invite you. Notes by other members stay visible to both of you while you share an archive.";

export async function reportSafetyIssue(input: {
  reason: ReportReason;
  noteId?: string;
  userId?: string;
  commentId?: string;
  /** A message in the archive's general chat. */
  messageId?: string;
  stickerId?: string;
  details?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("report_safety_issue", {
    reason_code: input.reason,
    target_note_id: input.noteId ?? null,
    target_user_id: input.userId ?? null,
    target_comment_id: input.commentId ?? null,
    report_details: input.details?.trim() ?? "",
    /* Sent only when set, so a report still reaches a database that has not
       had the general chat's safety migration. */
    ...(input.messageId ? { target_message_id: input.messageId } : {}),
    ...(input.stickerId ? { target_sticker_id: input.stickerId } : {}),
  });
  if (error || typeof data !== "string")
    throw new Error("Could not submit this report. Please try again or contact support.");
  return data;
}

export interface BlockedUser {
  blocked_id: string;
  blocked_name: string;
}
export async function loadBlockedUsers(): Promise<BlockedUser[]> {
  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id,blocked_name")
    .order("created_at");
  if (error) throw new Error("Could not load blocked accounts. Please try again.");
  return data ?? [];
}
export async function blockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("block_user", { target_user_id: userId });
  if (error) throw new Error("Could not block this account. Please try again.");
  publishHidden(new Set(hidden).add(userId));
}
export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("unblock_user", { target_user_id: userId });
  if (error) throw new Error("Could not unblock this account. Please try again.");
  // They may have blocked back: only the server knows whether they stay hidden.
  await refreshHiddenPeople();
}

/* People on the other side of a block, either way. Presence and carets in
   notes other members wrote drop them. Ids only, refreshed on each note open.
   Until a lookup succeeds nobody is shown, and a failed one is retried. */
let hidden: ReadonlySet<string> = new Set<string>();
let hiddenLoaded = false;
let hiddenRetry: ReturnType<typeof setTimeout> | undefined;
const hiddenListeners = new Set<() => void>();
function publishHidden(next: ReadonlySet<string>, loaded = hiddenLoaded) {
  hidden = next;
  hiddenLoaded = loaded;
  for (const listener of hiddenListeners) listener();
}
export const isHiddenPerson = (userId: string | undefined) =>
  !!userId && (!hiddenLoaded || hidden.has(userId));
export const hiddenPeople = (): ReadonlySet<string> | null => (hiddenLoaded ? hidden : null);
export function subscribeHiddenPeople(listener: () => void): () => void {
  hiddenListeners.add(listener);
  return () => hiddenListeners.delete(listener);
}
export async function refreshHiddenPeople(attempt = 0): Promise<void> {
  clearTimeout(hiddenRetry);
  const { data, error } = await supabase.rpc("hidden_people");
  if (!error && Array.isArray(data)) return publishHidden(new Set(data as string[]), true);
  // An unverified list shows nobody rather than someone who may be blocked.
  // ponytail: retries while the app is open, capped at 30 s apart.
  publishHidden(hidden, false);
  hiddenRetry = setTimeout(
    () => void refreshHiddenPeople(attempt + 1),
    Math.min(30_000, 1_000 * 2 ** attempt),
  );
}
/** Only for an archive the caller created, and only someone they blocked. */
export async function removeBlockedMember(archiveId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_blocked_member", {
    target_archive_id: archiveId,
    target_user_id: userId,
  });
  if (error) throw new Error("Could not remove them from this archive. Please try again.");
}
