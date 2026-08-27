import { parseBundle, deriveSessionKeys, type SessionKeys, type Bundle } from "./crypto";

export interface AppSession {
  role: "u1" | "u2";
  keys: SessionKeys;
  pat: string;
  repo: string;
}

const KEY = "napp:session";

interface Stored {
  role: "u1" | "u2";
  token: string;
  pat: string;
  repo: string;
}

export async function createSession(token: string): Promise<AppSession> {
  const bundle: Bundle = parseBundle(token);
  const keys = await deriveSessionKeys(bundle);
  sessionStorage.setItem(
    KEY,
    JSON.stringify({
      role: bundle.type,
      token,
      pat: bundle.pat,
      repo: bundle.repo,
    } satisfies Stored),
  );
  return { role: bundle.type, keys, pat: bundle.pat, repo: bundle.repo };
}

export async function restoreSession(): Promise<AppSession | null> {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const stored: Stored = JSON.parse(raw);
    const bundle = parseBundle(stored.token);
    const keys = await deriveSessionKeys(bundle);
    return { role: bundle.type, keys, pat: bundle.pat, repo: bundle.repo };
  } catch {
    sessionStorage.removeItem(KEY);
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(KEY);
}
