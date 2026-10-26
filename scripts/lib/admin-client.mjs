import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadEnv, requireEnv } from "./env.mjs";

/** Administrative credentials stay in process memory; callers must never log
 * the client, environment, CLI stdout, or raw subprocess exceptions. */
export async function adminClient() {
  const env = await loadEnv();
  requireEnv(env, ["VITE_SUPABASE_URL"]);
  let key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !/^[A-Za-z0-9_.-]+$/.test(key)) {
    const ref = new URL(env.VITE_SUPABASE_URL).hostname.split(".")[0];
    assert(/^[a-z]{20}$/.test(ref), "Expected a hosted Supabase project");
    const { stdout } = await promisify(execFile)("supabase", [
      "projects",
      "api-keys",
      "--project-ref",
      ref,
      "--reveal",
      "-o",
      "json",
    ]).catch(() => {
      throw new Error("Administrative credentials unavailable");
    });
    const result = JSON.parse(stdout);
    const keys = Array.isArray(result) ? result : (result.keys ?? result.api_keys);
    key = keys?.find((entry) => entry.name === "service_role")?.api_key;
  }
  assert(
    typeof key === "string" && /^[A-Za-z0-9_.-]+$/.test(key),
    "Administrative credentials unavailable",
  );
  return createClient(env.VITE_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
