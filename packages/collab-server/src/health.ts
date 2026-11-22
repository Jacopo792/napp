import type { SupabaseClient } from "@supabase/supabase-js";

// Render allows five seconds for the whole HTTP check. Leave time to answer,
// but do not treat a database taking more than 1.2 seconds as an outage.
export const PROBE_MS = 4000;

export async function probeSupabase(service: SupabaseClient, timeoutMs = PROBE_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // The entitlement migration also installs archive_plan, required to open
    // collaborative notes. Checking an older table would accept a stale schema.
    const result = await service
      .from("account_entitlements")
      .select("owner_id", { head: true })
      .limit(1)
      // The platform schedules the next probe. SDK backoff would conceal the
      // original HTTP error and consume this check's entire deadline.
      .retry(false)
      .abortSignal(controller.signal);
    return {
      ok: !result.error,
      failure: result.error
        ? controller.signal.aborted
          ? "timeout"
          : `HTTP ${result.status}, code ${result.error.code || "unknown"}`
        : null,
    };
  } catch {
    return { ok: false, failure: controller.signal.aborted ? "timeout" : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}
