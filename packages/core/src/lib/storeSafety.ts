import { supabase } from "./supabaseClient";

export const REPORT_REASONS = [
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
  const next = new Set(hidden);
  next.delete(userId);
  publishHidden(next);
}

/* People on the other side of a block, either way. Presence and carets in
   notes other members wrote drop them. Ids only, refreshed on each note open;
   `null` until the first answer, so nobody is shown before it arrives. */
let hidden: ReadonlySet<string> = new Set<string>();
let hiddenLoaded = false;
const hiddenListeners = new Set<() => void>();
function publishHidden(next: ReadonlySet<string>) {
  hidden = next;
  hiddenLoaded = true;
  for (const listener of hiddenListeners) listener();
}
export const isHiddenPerson = (userId: string | undefined) => !!userId && hidden.has(userId);
export const hiddenPeople = (): ReadonlySet<string> | null => (hiddenLoaded ? hidden : null);
export function subscribeHiddenPeople(listener: () => void): () => void {
  hiddenListeners.add(listener);
  return () => hiddenListeners.delete(listener);
}
export async function refreshHiddenPeople(): Promise<void> {
  const { data, error } = await supabase.rpc("hidden_people");
  // A failed question shows people rather than leaving presence empty for good.
  publishHidden(!error && Array.isArray(data) ? new Set(data as string[]) : hidden);
}
/** Only for an archive the caller created, and only someone they blocked. */
export async function removeBlockedMember(archiveId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc("remove_blocked_member", {
    target_archive_id: archiveId,
    target_user_id: userId,
  });
  if (error) throw new Error("Could not remove them from this archive. Please try again.");
}
