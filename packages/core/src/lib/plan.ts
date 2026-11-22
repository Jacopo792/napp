import { fail, supabase } from "./supabaseClient";

export interface AccountPlan {
  plan: "free" | "plus";
  trial_ends_at: string | null;
  days_left: number | null;
  access_ends_at: string | null;
  stripe_billing?: boolean;
}

export interface ArchivePlan {
  plan: AccountPlan["plan"];
  can_write: boolean;
  plan_writable: boolean;
  seat_limit: number;
  remaining_ms: number | null;
}

export async function loadAccountPlan(): Promise<AccountPlan> {
  const { data, error } = await supabase.rpc("my_plan");
  fail(error);
  return data;
}

export async function loadArchivePlan(archiveId: string): Promise<ArchivePlan | null> {
  const { data, error } = await supabase.rpc("archive_plan", { target_archive_id: archiveId });
  fail(error);
  return data;
}
