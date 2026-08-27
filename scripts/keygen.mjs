#!/usr/bin/env node
/**
 * NAPP keygen — generates deterministic key bundles from .env
 *
 * Usage:
 *   npm run keygen
 *
 * Required .env values:
 *   MASTER_SEED   64 hex chars (32 random bytes). Generate once with:
 *                   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *   GITHUB_PAT    Fine-grained PAT — Contents: Read & Write on this repo only
 *   GITHUB_REPO   "owner/repo" format
 *
 * Output:
 *   Two opaque base64 tokens — one for u1 (master), one for u2.
 *   Paste each into the app's login screen.
 *
 * Key properties:
 *   - Deterministic: same .env → same tokens every run
 *   - u1 token: contains master seed, derives both keys at login
 *   - u2 token: contains only the derived u2 key, cannot reach u1 notes
 *   - Both tokens embed the PAT so GitHub writes work transparently
 *   - Keys cannot be "rotated" — if MASTER_SEED changes, all notes become
 *     unreadable. Keep MASTER_SEED in a password manager.
 */

import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const { subtle } = webcrypto;
const __dir = dirname(fileURLToPath(import.meta.url));

// ── .env parser ────────────────────────────────────────────────────────────

function loadEnv() {
  const path = resolve(__dir, "../.env");
  try {
    return Object.fromEntries(
      readFileSync(path, "utf-8")
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.startsWith("#") && l.includes("="))
        .map((l) => {
          const eq = l.indexOf("=");
          const k = l.slice(0, eq).trim();
          const v = l
            .slice(eq + 1)
            .trim()
            .replace(/^["']|["']$/g, "");
          return [k, v];
        }),
    );
  } catch {
    console.error("❌  Cannot read .env — copy .env.example and fill it in.");
    process.exit(1);
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

const env = loadEnv();
const { MASTER_SEED, GITHUB_PAT, GITHUB_REPO } = env;

if (!MASTER_SEED || !GITHUB_PAT || !GITHUB_REPO) {
  console.error(
    "❌  .env is missing one or more required values: MASTER_SEED, GITHUB_PAT, GITHUB_REPO",
  );
  process.exit(1);
}

if (!/^[0-9a-fA-F]{64}$/.test(MASTER_SEED)) {
  console.error(
    [
      "❌  MASTER_SEED must be exactly 64 hex characters (32 bytes).",
      "    Generate one with:",
      "      node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    ].join("\n"),
  );
  process.exit(1);
}

if (!GITHUB_REPO.includes("/")) {
  console.error('❌  GITHUB_REPO must be in "owner/repo" format.');
  process.exit(1);
}

// ── Key derivation (mirrors browser crypto.ts exactly) ────────────────────

async function deriveKeyHex(seedHex, userId) {
  const seedBytes = Buffer.from(seedHex, "hex");
  const km = await subtle.importKey("raw", seedBytes, "HKDF", false, ["deriveKey"]);
  const key = await subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: Buffer.from("napp-v1"),
      info: Buffer.from(userId),
    },
    km,
    { name: "AES-GCM", length: 256 },
    true, // extractable so we can get the raw hex for the u2 bundle
    ["encrypt", "decrypt"],
  );
  const raw = await subtle.exportKey("raw", key);
  return Buffer.from(raw).toString("hex");
}

// ── Bundle generation ──────────────────────────────────────────────────────

const u2KeyHex = await deriveKeyHex(MASTER_SEED, "u2");

const u1Bundle = Buffer.from(
  JSON.stringify({ type: "u1", seed: MASTER_SEED, pat: GITHUB_PAT, repo: GITHUB_REPO }),
).toString("base64");

const u2Bundle = Buffer.from(
  JSON.stringify({ type: "u2", key: u2KeyHex, pat: GITHUB_PAT, repo: GITHUB_REPO }),
).toString("base64");

// ── Output ─────────────────────────────────────────────────────────────────

console.log("\n┌─────────────────────────────────────────┐");
console.log("│            NAPP — Key Bundles           │");
console.log("└─────────────────────────────────────────┘\n");

console.log("User 1 (master) — keep private, never share:");
console.log(u1Bundle);

console.log("\nUser 2 — send this once via a secure channel:");
console.log(u2Bundle);

console.log("\n⚠   These keys are permanent. There is no rotation.");
console.log("    Back up your .env — same MASTER_SEED always produces the same keys.");
console.log("    If MASTER_SEED is lost, all notes become permanently unreadable.\n");
