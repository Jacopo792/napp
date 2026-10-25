import { execFileSync } from "node:child_process";

/** Deliberately never loads .env or accepts a hosted service-role key. */
export function localStack() {
  let status;
  try {
    status = JSON.parse(
      execFileSync("supabase", ["status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    throw new Error("Full-stack E2E require a running local Supabase: run supabase start");
  }
  const url = new URL(status.API_URL);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || url.protocol !== "http:")
    throw new Error("E2E only run against local Supabase");
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY)
    throw new Error("Local Supabase credentials unavailable");
  return {
    url: url.href.replace(/\/$/, ""),
    key: status.ANON_KEY as string,
    serviceKey: status.SERVICE_ROLE_KEY as string,
  };
}
