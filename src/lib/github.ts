const API = "https://api.github.com";

export interface RemoteFile {
  path: string;
  sha: string;
  content: string;
}

async function gh(pat: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    // GitHub answers with `Cache-Control: max-age=60`, so without this the
    // browser would happily serve a minute-old listing to the sync poller.
    cache: "no-store",
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

export interface TreeFile {
  /** File name inside `notes/`, e.g. `meta-u1.napp`. */
  name: string;
  /** Full repo path, e.g. `notes/meta-u1.napp`. */
  path: string;
  /** Git blob SHA. Changes exactly when the file's bytes change. */
  sha: string;
}

export type TreeListing =
  | { unchanged: true }
  | { unchanged: false; etag: string | undefined; files: TreeFile[] };

/**
 * The whole `notes/` directory with its blob SHAs, in one request — enough to
 * tell which files another device rewrote without reading any content.
 *
 * Pass the previous ETag: GitHub answers 304 when nothing moved, and 304s do
 * not count against the REST rate limit, so idle polling is essentially free.
 */
export async function listNotesTree(
  repo: string,
  pat: string,
  etag?: string,
): Promise<TreeListing> {
  const res = await gh(pat, `/repos/${repo}/git/trees/data:notes`, {
    headers: etag ? { "If-None-Match": etag } : undefined,
  });
  if (res.status === 304) return { unchanged: true };
  // No notes written yet: the directory does not exist on the branch.
  if (res.status === 404) return { unchanged: false, etag: undefined, files: [] };
  if (!res.ok) throw new Error(`GitHub tree failed: ${res.status}`);

  const data: { tree: { path: string; type: string; sha: string }[] } = await res.json();
  const files = data.tree
    .filter((e) => e.type === "blob" && e.path.endsWith(".napp"))
    .map((e) => ({ name: e.path, path: `notes/${e.path}`, sha: e.sha }));
  return { unchanged: false, etag: res.headers.get("ETag") ?? undefined, files };
}

/**
 * Reads a blob by its SHA. Content addressed by SHA can never be stale, unlike
 * the `raw.githubusercontent.com` URLs handed out by the Contents API, which
 * are branch addressed and served from a CDN with a five-minute lifetime — the
 * reason a plain page refresh used to show yesterday's text. It also side-steps
 * the Contents API's 1 MB ceiling, which notes with embedded images can exceed.
 */
export async function readBlob(repo: string, pat: string, sha: string): Promise<string> {
  const res = await gh(pat, `/repos/${repo}/git/blobs/${sha}`, {
    // A blob's bytes are its SHA: the browser may cache it forever.
    cache: "default",
    headers: { Accept: "application/vnd.github.raw" },
  });
  if (!res.ok) throw new Error(`Blob read failed: ${res.status}`);
  return res.text();
}

/** Reads a single file from the data branch via Contents API. Returns null if not found. */
export async function readFile(
  repo: string,
  pat: string,
  path: string,
): Promise<RemoteFile | null> {
  const res = await gh(pat, `/repos/${repo}/contents/${path}?ref=data`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read failed ${res.status}`);
  const data = await res.json();
  const raw = atob((data.content as string).replace(/\s/g, ""));
  const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
  return { path: data.path, sha: data.sha, content: new TextDecoder().decode(bytes) };
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Creates or updates a file on the data branch. Returns the new blob SHA. */
export async function writeNoteFile(
  repo: string,
  pat: string,
  path: string,
  content: string,
  sha?: string,
  message?: string,
): Promise<string> {
  const body: Record<string, string> = {
    message: message ?? (sha ? "update note" : "create note"),
    content: utf8ToBase64(content),
    branch: "data",
  };
  if (sha) body.sha = sha;

  const res = await gh(pat, `/repos/${repo}/contents/${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`GitHub write failed ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.content.sha as string;
}

export async function deleteNoteFile(
  repo: string,
  pat: string,
  path: string,
  sha: string,
): Promise<void> {
  const res = await gh(pat, `/repos/${repo}/contents/${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "delete note", sha, branch: "data" }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    throw new Error(`GitHub delete failed ${res.status}: ${msg}`);
  }
}

/** Creates the `data` branch if it doesn't exist. Safe to call on every login. */
export async function ensureDataBranch(repo: string, pat: string): Promise<void> {
  const check = await gh(pat, `/repos/${repo}/git/refs/heads/data`);
  if (check.ok) return;
  if (check.status !== 404) throw new Error(`Branch check failed: ${check.status}`);

  const repoRes = await gh(pat, `/repos/${repo}`);
  if (!repoRes.ok) throw new Error(`Repo fetch failed: ${repoRes.status}`);
  const repoData = await repoRes.json();

  const refRes = await gh(pat, `/repos/${repo}/git/refs/heads/${repoData.default_branch}`);
  if (!refRes.ok) throw new Error(`Could not get default branch ref`);
  const refData = await refRes.json();

  const createRes = await gh(pat, `/repos/${repo}/git/refs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "refs/heads/data", sha: refData.object.sha }),
  });
  if (!createRes.ok && createRes.status !== 422) {
    const msg = await createRes.text().catch(() => createRes.statusText);
    throw new Error(`Create branch failed ${createRes.status}: ${msg}`);
  }
}
