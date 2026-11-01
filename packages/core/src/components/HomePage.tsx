/* Home, in the window's empty pane. The sidebar already says where things are
 * — pinned notes, folders, the shelf and the bin — and the list beside it
 * already runs one person's notes by date, so Home says only what neither can:
 * the note to carry on with, the remarks nobody here has read, and what the
 * others have lately written. It only lists and opens; every act on a note
 * stays in the list and the sidebar. */
import { useMemo } from "react";
import { ArrowRight } from "@/components/icons";
import { derivedOf, indexOf } from "@/lib/derived";
import type { NoteEntry } from "@/lib/entries";
import { formatStamp } from "@/lib/format";
import type { Meta } from "@/lib/types";

export interface HomeRemark {
  id: string;
  noteId: string;
  noteTitle: string;
  author: string;
  body: string;
  createdAt: string;
}

export function HomePage({
  entries,
  meta,
  remarks,
  others,
  onOpen,
}: {
  /** The notes of whoever is being read, already without trash and archive. */
  entries: NoteEntry[];
  meta: Meta;
  /** Unread remarks across the archive, newest first. */
  remarks: HomeRemark[];
  /** The other members' latest notes, newest first. */
  others: { entry: NoteEntry; who: string }[];
  onOpen: (noteId: string) => void;
}) {
  const index = indexOf(meta);
  const recent = useMemo(
    () => [...entries].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt)),
    [entries],
  );
  const latest = recent[0];
  if (!latest) return null;
  const many = new Set(others.map(({ who }) => who)).size > 1;
  const folderOf = (entry: NoteEntry) =>
    index.byFolder.get(index.byNote.get(entry.note.id)?.folderId ?? "")?.name;

  return (
    <div className="home-page">
      <button type="button" className="home-continue press" onClick={() => onOpen(latest.note.id)}>
        <span className="home-kicker">Continue writing</span>
        <span className="home-continue-title">{latest.note.title || "Untitled"}</span>
        <span className="home-continue-preview">{derivedOf(latest.note).preview}</span>
        <span className="home-continue-foot">
          <span>
            {[folderOf(latest), formatStamp(latest.note.updatedAt)].filter(Boolean).join(" · ")}
          </span>
          <span className="home-arrow" aria-hidden="true">
            <ArrowRight size={16} />
          </span>
        </span>
      </button>

      {remarks.length > 0 && (
        <section className="home-section">
          <h3>Remarks to read</h3>
          <div className="home-card">
            {remarks.map((remark) => (
              <button
                key={remark.id}
                type="button"
                className="home-row press"
                onClick={() => onOpen(remark.noteId)}
              >
                <span className="home-row-line">
                  <span className="home-row-title">
                    {remark.author} · {remark.noteTitle || "Untitled"}
                  </span>
                  <time>{formatStamp(remark.createdAt)}</time>
                </span>
                <span className="home-row-body">{remark.body}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section className="home-section">
          <h3>{many ? "From the others" : `From ${others[0].who}`}</h3>
          <div className="home-card">
            {others.map(({ entry, who }) => (
              <button
                key={entry.note.id}
                type="button"
                className="home-row press"
                onClick={() => onOpen(entry.note.id)}
              >
                <span className="home-row-line">
                  <span className="home-row-title">{entry.note.title || "Untitled"}</span>
                  {many && <span className="home-row-place">{who}</span>}
                  <time>{formatStamp(entry.note.updatedAt)}</time>
                </span>
                <span className="home-row-body">{derivedOf(entry.note).preview}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
