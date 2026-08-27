import type { Meta } from "./types";
import type { SessionKeys } from "./crypto";
import { encryptMeta } from "./crypto";
import { readFile, writeNoteFile } from "./github";

export async function saveMeta(
  repo: string,
  pat: string,
  keys: SessionKeys,
  owner: "u1" | "u2",
  meta: Meta,
  sha: string | undefined,
): Promise<string> {
  const content = await encryptMeta(meta, keys, owner);
  try {
    return await writeNoteFile(repo, pat, `notes/meta-${owner}.napp`, content, sha, "update meta");
  } catch (e) {
    // 409 = stale or missing SHA — re-read current SHA from GitHub and retry once
    if (e instanceof Error && e.message.includes("409")) {
      const current = await readFile(repo, pat, `notes/meta-${owner}.napp`);
      return writeNoteFile(
        repo,
        pat,
        `notes/meta-${owner}.napp`,
        content,
        current?.sha,
        "update meta",
      );
    }
    throw e;
  }
}
