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
  "Blocking stops direct invitations and hides notes and comments between you. Documents owned by other members and existing shared-archive memberships remain. Report abuse in those documents so it can be reviewed.";

export async function reportSafetyIssue(input: {
  reason: ReportReason;
  noteId?: string;
  userId?: string;
  commentId?: string;
  details?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc("report_safety_issue", {
    reason_code: input.reason,
    target_note_id: input.noteId ?? null,
    target_user_id: input.userId ?? null,
    target_comment_id: input.commentId ?? null,
    report_details: input.details?.trim() ?? "",
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
}
export async function unblockUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc("unblock_user", { target_user_id: userId });
  if (error) throw new Error("Could not unblock this account. Please try again.");
}
