import type { Note, Meta } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

export type { Note };

export interface SessionKeys {
  u1?: CryptoKey;
  u2: CryptoKey;
}

export type U1Bundle = { type: "u1"; seed: string; pat: string; repo: string };
export type U2Bundle = { type: "u2"; key: string; pat: string; repo: string };
export type Bundle = U1Bundle | U2Bundle;

// ── Helpers ────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBin(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// ── Key derivation ─────────────────────────────────────────────────────────

async function hkdfAesKey(seedHex: string, userId: "u1" | "u2"): Promise<CryptoKey> {
  const km = await crypto.subtle.importKey("raw", hexToBytes(seedHex), "HKDF", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("napp-v1"),
      info: new TextEncoder().encode(userId),
    },
    km,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function importRawAesKey(keyHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", hexToBytes(keyHex), { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

// ── Bundle parsing ─────────────────────────────────────────────────────────

export function parseBundle(token: string): Bundle {
  let obj: unknown;
  try {
    obj = JSON.parse(atob(token.trim()));
  } catch {
    throw new Error("Invalid key — paste the full token from keygen");
  }
  if (!obj || typeof obj !== "object" || !("type" in obj) || !("pat" in obj) || !("repo" in obj))
    throw new Error("Malformed key bundle");
  const b = obj as Record<string, unknown>;
  if (b.type !== "u1" && b.type !== "u2") throw new Error("Unknown bundle type");
  if (b.type === "u1" && !b.seed) throw new Error("u1 bundle missing seed");
  if (b.type === "u2" && !b.key) throw new Error("u2 bundle missing key");
  return obj as Bundle;
}

export async function deriveSessionKeys(bundle: Bundle): Promise<SessionKeys> {
  if (bundle.type === "u1") {
    const [u1, u2] = await Promise.all([
      hkdfAesKey(bundle.seed, "u1"),
      hkdfAesKey(bundle.seed, "u2"),
    ]);
    return { u1, u2 };
  }
  return { u2: await importRawAesKey(bundle.key) };
}

// ── Generic encrypt / decrypt ──────────────────────────────────────────────

async function aesEncrypt(key: CryptoKey, header: string, payload: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const combined = new Uint8Array(12 + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), 12);
  return `${header}\n${btoa(toBin(combined.buffer))}`;
}

async function aesDecrypt<T>(content: string, key: CryptoKey): Promise<T | null> {
  const nl = content.indexOf("\n");
  if (nl === -1) return null;
  try {
    const bytes = Uint8Array.from(atob(content.slice(nl + 1).trim()), (c) => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

// ── Note file format ───────────────────────────────────────────────────────
//  Line 1: NAPP:1:<owner>   e.g. NAPP:1:u2
//  Line 2: base64(IV[12] || AES-GCM ciphertext)

export async function encryptNote(note: Note, keys: SessionKeys): Promise<string> {
  const key = note.owner === "u1" ? keys.u1! : keys.u2;
  return aesEncrypt(key, `NAPP:1:${note.owner}`, note);
}

export async function decryptFile(content: string, keys: SessionKeys): Promise<Note | null> {
  const m = content.match(/^NAPP:1:(u[12])\n/);
  if (!m) return null;
  const tag = m[1] as "u1" | "u2";
  const key = tag === "u1" ? keys.u1 : keys.u2;
  if (!key) return null;
  return aesDecrypt<Note>(content, key);
}

// ── Meta file format ───────────────────────────────────────────────────────
//  Line 1: NAPP:1:meta-<owner>
//  Line 2: base64(IV[12] || AES-GCM ciphertext)

export async function encryptMeta(
  meta: Meta,
  keys: SessionKeys,
  owner: "u1" | "u2",
): Promise<string> {
  const key = owner === "u1" ? keys.u1! : keys.u2;
  return aesEncrypt(key, `NAPP:1:meta-${owner}`, meta);
}

export async function decryptMeta(content: string, keys: SessionKeys): Promise<Meta | null> {
  const m = content.match(/^NAPP:1:meta-(u[12])\n/);
  if (!m) return null;
  const owner = m[1] as "u1" | "u2";
  const key = owner === "u1" ? keys.u1 : keys.u2;
  if (!key) return null;
  return aesDecrypt<Meta>(content, key);
}
