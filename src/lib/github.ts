const API = "https://api.github.com";

export interface RemoteFile {
  path: string;
  sha: string;
  content: string;
}

async function gh(pat: string, path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${pat}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
  });
}

interface GHEntry {
  name: string;
  path: string;
  sha: string;
  download_url: string;
}

export async function fetchNoteFiles(repo: string, pat: string): Promise<RemoteFile[]> {
  const res = await gh(pat, `/repos/${repo}/contents/notes?ref=data`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub list failed: ${res.status}`);

  const entries: GHEntry[] = await res.json();
  const napp = entries.filter((f) => f.name.endsWith(".napp") && !f.name.startsWith("meta-"));

  return Promise.all(
    napp.map(async (f) => {
      const raw = await fetch(f.download_url);
      if (!raw.ok) throw new Error(`Fetch ${f.name} failed: ${raw.status}`);
      return { path: f.path, sha: f.sha, content: await raw.text() };
    }),
  );
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
