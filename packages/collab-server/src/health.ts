import type { SupabaseClient } from "@supabase/supabase-js";

// Render allows five seconds for the whole HTTP check. Leave time to answer,
// but do not treat a database taking more than 1.2 seconds as an outage.
export const PROBE_MS = 4000;

export async function probeSupabase(service: SupabaseClient, timeoutMs = PROBE_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Only connectivity matters. An exact count scans the archive catalogue
    // even though this request needs no rows and no total.
    const result = await service
      .from("archives")
      .select("id", { head: true })
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
