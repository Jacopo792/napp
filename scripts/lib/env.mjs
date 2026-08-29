import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Local administrative tools read the same untracked files the developer edits.
 * Real process environment wins so CI or a one-off shell can override a value.
 */
export async function loadEnv() {
  const values = {};
  for (const filename of [".env", ".env.local"]) {
    try {
      const content = await readFile(resolve(projectRoot, filename), "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
        const separator = trimmed.indexOf("=");
        values[trimmed.slice(0, separator).trim()] = trimmed
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return { ...values, ...process.env };
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function fail(error) {
  if (error) throw new Error(error.message);
}

export function requireEnv(env, names) {
  for (const name of names) assert(env[name], `Missing ${name}`);
}

/** Every script talks to Supabase the way the browser does: the publishable
    key plus a real account, so RLS is exercised rather than bypassed. */
export function anonClient(env) {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
