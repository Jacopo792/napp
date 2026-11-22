import { PREVIEW_PLUS } from "./stripe.mock";
import type { AccountPlan, ArchivePlan } from "../packages/core/src/lib/plan";

const dayMs = 86_400_000;
const parameter = () => new URLSearchParams(globalThis.location?.search).get("plan");

export async function loadAccountPlan(): Promise<AccountPlan> {
  /* A network's worth of wait, so loading states can be seen in the preview. */
  await new Promise((done) => setTimeout(done, 450));
  if (parameter()) sessionStorage.removeItem(PREVIEW_PLUS);
  if (sessionStorage.getItem(PREVIEW_PLUS))
    return {
      plan: "plus",
      trial_ends_at: null,
      days_left: null,
      access_ends_at: new Date(Date.now() + 365 * dayMs).toISOString(),
      stripe_billing: true,
    };
  const value = parameter();
  const free = value === "free" || value === "readonly";
  const days = value === "last-day" ? 1 : value === "last-week" ? 7 : 30;
  const ends = new Date(Date.now() + (free ? -dayMs : days * dayMs)).toISOString();
  return {
    plan: free ? "free" : "plus",
    trial_ends_at: ends,
    days_left: free ? null : days,
    access_ends_at: ends,
  };
}

export async function loadArchivePlan(_archiveId: string): Promise<ArchivePlan> {
  const account = await loadAccountPlan();
  const writable = parameter() !== "readonly";
  return {
    plan: account.plan,
    can_write: writable,
    plan_writable: writable,
    seat_limit: account.plan === "plus" ? 8 : 2,
    remaining_ms: null,
  };
}
