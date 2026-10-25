import { useMemo, type ReactNode } from "react";
import { ArrowRight } from "./icons";
import type { NoteEntry } from "@/lib/entries";
import type { Meta } from "@/lib/types";
import { ALL, entriesInScope } from "@/lib/scopes";
import { derivedOf, indexOf } from "@/lib/derived";
import { formatStamp } from "@/lib/format";

/* ── Home ────────────────────────────────────────────────────────────────────
   The notebook's front page, and only what the sidebar cannot say. The
   sidebar is where places live — every folder and what is in it — so Home
   carries no folders: it answers time, people and what is waiting. What was
   written last, what somebody said that this account has not read, what is
   pinned, what changed lately across every folder, and what the others wrote
   while this reader was away.

   It is not a place. It is what the note pane shows when no note is open in
   it — at launch, after a note is closed, when the open note leaves the
   list — with the list beside it the whole time; opening anything from it
   puts that note in the same pane. A Home row beside All notes was two
   places that both meant "my notes", and that was the confusion.

   Archive and Recently Deleted are not on it: they stand at the foot of the
   sidebar, as they do in Notes and Mail. The strip is the note's strip with
   nothing open in it: the line across the window, and the columns' way back
   when they are away. Nothing here asks the database anything but Lately,
   which is one bounded read the caller makes. */

/** A remark somebody else wrote, in an open thread, since this account last
 *  opened its note — the badge's rule, one card per thread. */
export interface HomeRemark {
  threadId: string;
  noteId: string;
  face: ReactNode;
  name: string;
  body: string;
  at: string;
}

/** A stretch of somebody else's writing in this notebook. */
export interface HomeChange {
  id: string;
  noteId: string;
  face: ReactNode;
  name: string;
  added: number | null;
  removed: number | null;
  at: string;
}

const RECENT = 8;

const newest = (entries: NoteEntry[]) =>
  [...entries].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));

const titleOf = (entry: NoteEntry | undefined) => entry?.note.title || "Untitled";

export function HomePage({
  leading,
  entries,
  meta,
  own,
  canWrite,
  faces,
  waiting,
  lately,
  onOpenNote,
  onOpenThread,
  onNew,
  foot,
}: {
  /** What stands at the start of the strip: the columns' way back, when
   *  they are away. */
  leading?: ReactNode;
  /** The chosen member's whole catalogue. */
  entries: NoteEntry[];
  meta: Meta;
  /** Whether this is the reader's own notebook. */
  own: boolean;
  canWrite: boolean;
  /** The faces of whoever is in a note now, or nothing. */
  faces: (noteId: string) => ReactNode;
  /** Unread remarks on this notebook's notes, newest first. */
  waiting: HomeRemark[];
  /** The others' latest writing in this notebook, newest first. */
  lately: HomeChange[];
  onOpenNote: (id: string) => void;
  onOpenThread: (noteId: string, threadId: string) => void;
  onNew: () => void;
  /** What closes the page on a phone's screen, where there is no sidebar:
   *  the Archive and Recently Deleted, as the phone app ends its Home. */
  foot?: ReactNode;
}) {
  const index = indexOf(meta);
  const page = useMemo(() => {
    const all = newest(entriesInScope(entries, meta, ALL));
    const pinned = all.filter((entry) => index.byNote.get(entry.note.id)?.pinned);
    const pinnedIds = new Set(pinned.map((entry) => entry.note.id));
    return {
      all,
      pinned,
      /* Pinned notes are already up the page; a second card for the same
         note is the repetition this page exists to avoid. */
      recent: all
        .slice(1)
        .filter((entry) => !pinnedIds.has(entry.note.id))
        .slice(0, RECENT),
      byId: new Map(all.map((entry) => [entry.note.id, entry])),
    };
  }, [entries, meta, index]);
  const folderName = new Map(meta.folders.map((folder) => [folder.id, folder.name]));
  const folderOf = (noteId: string) => folderName.get(index.byNote.get(noteId)?.folderId ?? "");
  const latest = page.all[0];
  const shownWaiting = waiting.filter((remark) => page.byId.has(remark.noteId));
  const shownLately = lately.filter((change) => page.byId.has(change.noteId)).slice(0, 6);

  const strip = <header className="home-strip">{leading}</header>;

  /* Nothing written yet: the first line, waiting. Your page only — a
     partner's empty page is simply empty. */
  if (!entries.length)
    return (
      <section className="home-page" aria-label="Home">
        {strip}
        <div className="home-scroll">
          <div className="home-measure">
            {own && canWrite && (
              <button type="button" className="home-card home-continue press" onClick={onNew}>
                <span className="home-continue-empty">
                  Write something
                  <i className="home-caret" aria-hidden="true" />
                </span>
                <span className="home-foot">
                  <span />
                  <span className="home-arrow is-accent" aria-hidden="true">
                    <ArrowRight size={17} />
                  </span>
                </span>
              </button>
            )}
            {foot}
          </div>
        </div>
      </section>
    );

  return (
    <section className="home-page" aria-label="Home">
      {strip}
      <div className="home-scroll">
        <div className="home-measure">
          {latest && (
            <button
              type="button"
              className="home-card home-continue press"
              onClick={() => onOpenNote(latest.note.id)}
            >
              <span className="home-label">Continue Writing</span>
              <span className="home-continue-title">{titleOf(latest)}</span>
              {derivedOf(latest.note).preview && (
                <span className="home-continue-preview">{derivedOf(latest.note).preview}</span>
              )}
              <span className="home-foot">
                <span className="home-where">
                  {[folderOf(latest.note.id), formatStamp(latest.note.updatedAt)]
                    .filter(Boolean)
                    .join(" · ")}
                  {faces(latest.note.id)}
                </span>
                <span className="home-arrow" aria-hidden="true">
                  <ArrowRight size={17} />
                </span>
              </span>
            </button>
          )}

          {shownWaiting.length > 0 && (
            <section className="home-section" aria-label="Waiting for You">
              <h2>Waiting for You</h2>
              <div className="home-grid is-wide">
                {shownWaiting.map((remark) => (
                  <button
                    key={remark.threadId}
                    type="button"
                    className="home-card home-wait press"
                    onClick={() => onOpenThread(remark.noteId, remark.threadId)}
                  >
                    <span className="home-wait-head">
                      <span className="home-wait-face">{remark.face}</span>
                      <span className="home-wait-name">{remark.name}</span>
                      <span className="home-card-date">{formatStamp(remark.at)}</span>
                    </span>
                    <span className="home-wait-body">{remark.body}</span>
                    <span className="home-card-where">{titleOf(page.byId.get(remark.noteId))}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {page.pinned.length > 0 && (
            <section className="home-section" aria-label="Pinned">
              <h2>Pinned</h2>
              <div className="home-grid">
                {page.pinned.map((entry) => (
                  <NoteCard
                    key={entry.note.id}
                    entry={entry}
                    className="home-pin"
                    folder={folderOf(entry.note.id)}
                    face={faces(entry.note.id)}
                    onOpen={onOpenNote}
                  />
                ))}
              </div>
            </section>
          )}

          {page.recent.length > 0 && (
            <section className="home-section" aria-label="Recent">
              <h2>Recent</h2>
              <div className="home-grid">
                {page.recent.map((entry) => (
                  <NoteCard
                    key={entry.note.id}
                    entry={entry}
                    className="home-recent"
                    folder={folderOf(entry.note.id)}
                    face={faces(entry.note.id)}
                    onOpen={onOpenNote}
                  />
                ))}
              </div>
            </section>
          )}

          {shownLately.length > 0 && (
            <section className="home-section" aria-label="Lately">
              <h2>Lately</h2>
              <div className="home-card home-lately">
                {shownLately.map((change) => (
                  <button
                    key={change.id}
                    type="button"
                    className="home-lately-row press"
                    onClick={() => onOpenNote(change.noteId)}
                  >
                    <span className="home-wait-face">{change.face}</span>
                    <span className="home-lately-what">
                      <span className="home-wait-name">{change.name}</span>
                      <span className="home-lately-note">
                        {titleOf(page.byId.get(change.noteId))}
                      </span>
                    </span>
                    {(change.added || change.removed) && (
                      <span className="home-lately-words">
                        {change.added ? <span className="is-added">+{change.added}</span> : null}
                        {change.removed ? (
                          <span className="is-removed">−{change.removed}</span>
                        ) : null}
                      </span>
                    )}
                    <span className="home-card-date">{formatStamp(change.at)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {foot}
        </div>
      </div>
    </section>
  );
}

function NoteCard({
  entry,
  className,
  folder,
  face,
  onOpen,
}: {
  entry: NoteEntry;
  className: string;
  folder: string | undefined;
  face: ReactNode;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className={`home-card home-note ${className} press`}
      onClick={() => onOpen(entry.note.id)}
    >
      <span className="home-note-title">{titleOf(entry)}</span>
      <span className="home-note-preview">{derivedOf(entry.note).preview}</span>
      <span className="home-note-foot">
        <span className="home-card-where">{folder}</span>
        {face}
        <span className="home-card-date">{formatStamp(entry.note.updatedAt)}</span>
      </span>
    </button>
  );
}
