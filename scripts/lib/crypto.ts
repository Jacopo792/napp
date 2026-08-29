/* The retired encrypted format.
 *
 * Nothing the browser ships imports this any more: notes, folders, tags and
 * archive settings are ordinary Postgres columns, and every stored object
 * carries its real content type. It lives here, beside the one-time migration
 * tools in `scripts/`, because those tools are the only thing that can still
 * need to read the old format — and because a crypto module sitting in
 * `src/lib` reads as part of the application's security story when it is not.
 */
import type { Folder, Meta, Note, Tag } from "../../src/lib/types.ts";

export interface SessionKeys {
  u1?: CryptoKey;
  u2: CryptoKey;
}

export interface WrappedArchiveKey {
  wrappedDek: string;
  kdfSalt: string;
  kdfIterations: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const MIN_KDF_ITERATIONS = 600_000;

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.trim());
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function importArchiveKey(raw: Uint8Array, extractable = false): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", ownedBuffer(raw), { name: "AES-GCM" }, extractable, [
    "encrypt",
    "decrypt",
  ]);
}

export function generateArchiveKeyBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function deriveKek(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  if (iterations < MIN_KDF_ITERATIONS) throw new Error("Archive key uses an unsafe KDF setting");
  const material = await crypto.subtle.importKey(
    "raw",
    ownedBuffer(encoder.encode(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: ownedBuffer(salt),
      iterations,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapArchiveKey(
  rawDek: Uint8Array,
  passphrase: string,
  salt = crypto.getRandomValues(new Uint8Array(16)),
  iterations = MIN_KDF_ITERATIONS,
): Promise<WrappedArchiveKey> {
  const kek = await deriveKek(passphrase, salt, iterations);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ownedBuffer(iv) },
    kek,
    ownedBuffer(rawDek),
  );
  const wrapped = new Uint8Array(iv.length + ciphertext.byteLength);
  wrapped.set(iv);
  wrapped.set(new Uint8Array(ciphertext), iv.length);
  return {
    wrappedDek: bytesToBase64(wrapped),
    kdfSalt: bytesToBase64(salt),
    kdfIterations: iterations,
  };
}

export async function unwrapArchiveKey(
  wrapped: WrappedArchiveKey,
  passphrase: string,
): Promise<Uint8Array> {
  const combined = base64ToBytes(wrapped.wrappedDek);
  if (combined.length < 29) throw new Error("Archive key is malformed");
  const kek = await deriveKek(passphrase, base64ToBytes(wrapped.kdfSalt), wrapped.kdfIterations);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedBuffer(combined.slice(0, 12)) },
      kek,
      ownedBuffer(combined.slice(12)),
    );
    const raw = new Uint8Array(plaintext);
    if (raw.length !== 32) throw new Error("Archive key has the wrong length");
    return raw;
  } catch {
    throw new Error("The archive passphrase is incorrect");
  }
}

export async function encryptJson(key: CryptoKey, payload: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ownedBuffer(iv) },
    key,
    ownedBuffer(encoder.encode(JSON.stringify(payload))),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return bytesToBase64(combined);
}

export async function decryptJson<T>(key: CryptoKey, ciphertext: string): Promise<T> {
  const combined = base64ToBytes(ciphertext);
  if (combined.length < 29) throw new Error("Encrypted value is malformed");
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedBuffer(combined.slice(0, 12)) },
      key,
      ownedBuffer(combined.slice(12)),
    );
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error("Encrypted archive data could not be decrypted");
  }
}

export async function encryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: ownedBuffer(iv) },
    key,
    ownedBuffer(bytes),
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined;
}

export async function decryptBytes(key: CryptoKey, bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 29) throw new Error("Encrypted image is malformed");
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ownedBuffer(bytes.slice(0, 12)) },
      key,
      ownedBuffer(bytes.slice(12)),
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Encrypted image could not be decrypted");
  }
}

export const encryptNote = (note: Note, key: CryptoKey) => encryptJson(key, note);
export const decryptNote = (ciphertext: string, key: CryptoKey) =>
  decryptJson<Note>(key, ciphertext);
export const encryptFolder = (folder: Folder, key: CryptoKey) =>
  encryptJson(key, { name: folder.name, parentId: folder.parentId ?? null });
export const decryptFolder = (ciphertext: string, key: CryptoKey) =>
  decryptJson<{ name: string; parentId?: string | null }>(key, ciphertext);
export const encryptTag = (tag: Tag, key: CryptoKey) => encryptJson(key, { name: tag.name });
export const decryptTag = (ciphertext: string, key: CryptoKey) =>
  decryptJson<{ name: string }>(key, ciphertext);

// Legacy GitHub archive support, retained only for the one-time migration.
async function hkdfAesKey(seedHex: string, owner: "u1" | "u2"): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    ownedBuffer(hexToBytes(seedHex)),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: ownedBuffer(encoder.encode("napp-v1")),
      info: ownedBuffer(encoder.encode(owner)),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function deriveLegacySessionKeys(seedHex: string): Promise<SessionKeys> {
  const [u1, u2] = await Promise.all([hkdfAesKey(seedHex, "u1"), hkdfAesKey(seedHex, "u2")]);
  return { u1, u2 };
}

async function decryptLegacyPayload<T>(content: string, key: CryptoKey): Promise<T | null> {
  const newline = content.indexOf("\n");
  if (newline === -1) return null;
  try {
    return await decryptJson<T>(key, content.slice(newline + 1).trim());
  } catch {
    return null;
  }
}

export async function decryptFile(content: string, keys: SessionKeys): Promise<Note | null> {
  const match = content.match(/^NAPP:1:(u[12])\n/);
  if (!match) return null;
  const owner = match[1] as "u1" | "u2";
  const key = owner === "u1" ? keys.u1 : keys.u2;
  return key ? decryptLegacyPayload<Note>(content, key) : null;
}

export async function decryptMeta(content: string, keys: SessionKeys): Promise<Meta | null> {
  const match = content.match(/^NAPP:1:meta-(u[12])\n/);
  if (!match) return null;
  const owner = match[1] as "u1" | "u2";
  const key = owner === "u1" ? keys.u1 : keys.u2;
  return key ? decryptLegacyPayload<Meta>(content, key) : null;
}
