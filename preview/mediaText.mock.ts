import type { AppSession } from "@/lib/sessionRestore";
const archives = new Map<string, Map<string, string>>();
export async function loadMediaText(session: AppSession): Promise<Map<string, string>> { return new Map(archives.get(session.archiveId)); }
export async function saveMediaText(session: AppSession, id: string, text: string): Promise<void> {
  let rows = archives.get(session.archiveId);
  if (!rows) { rows = new Map(); archives.set(session.archiveId, rows); }
  rows.set(id, text);
}

export function subscribeMediaText(_session: AppSession, _changed: () => void): () => void {return () => {}; }
