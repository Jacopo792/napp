/* A folder, opened from its row: what is in it and what has been happening
 * there.
 *
 * The note sheet's sibling, in the same frame — the folder's glyph is what
 * flies. It counts the way the sidebar counts a closed folder, the way Finder
 * does: the folder and every folder under it, so the numbers here and the
 * number on the row agree.
 *
 *   where   — the folder above, the folders inside;
 *   how much — notes, words, changes this week;
 *   who     — everyone who has written in it;
 *   what    — the notes edited last, the latest versions, open remarks.
 *
 * Every name is a door. A folder pushes its own sheet, a face pushes the
 * person, and Back comes back here; a note, a version or a remark opens the
 * note itself. */
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Folder, FolderOpen, MessageSquare, RotateCcw } from "@/components/icons";
import { Sheet, type SheetOrigin } from "@/components/Sheet";
import type { SheetPerson } from "@/components/NoteSheet";
import { Avatar } from "@/components/WorkspaceMenus";
import { loadFolderVersions, type FolderVersion } from "@/lib/history";
import { formatDateTime } from "@/lib/format";
import type { AppSession } from "@/lib/session";

const WEEK_MS = 7 * 86_400_000;
const RECENT = 6;

export interface FolderSheetFacts {
  id: string;
  name: string;
  parent: { id: string; name: string } | null;
  children: { id: string; name: string }[];
  /** The notes in it and under it, neither trashed nor archived. */
  notes: { id: string; title: string; updatedAt: string; words: number }[];
  /** Notes in it with a conversation nobody has resolved. */
  remarks: { noteId: string; title: string; threads: number }[];
}

interface Props {
  session: AppSession;
  folder: FolderSheetFacts;
  origin: SheetOrigin;
  personOf: (userId: string) => SheetPerson | null;
  onShowFolder: (folderId: string) => void;
  /** Another folder's sheet, flying out of the name that was pressed. */
  onOpenFolder: (folderId: string, from: Element) => void;
  onOpenNote: (noteId: string, then?: { history?: string | true; comments?: boolean }) => void;
  onOpenPerson: (userId: string, from: Element) => void;
}

export function FolderSheet({
  session,
  folder,
  origin,
  personOf,
  onShowFolder,
  onOpenFolder,
  onOpenNote,
  onOpenPerson,
}: Props) {
  const [versions, setVersions] = useState<FolderVersion[] | null>(null);
  const [failure, setFailure] = useState("");
  const noteKey = folder.notes.map((note) => note.id).join();

  useEffect(() => {
    let live = true;
    loadFolderVersions(session, noteKey ? noteKey.split(",") : [])
      .then((list) => live && setVersions(list))
      .catch((error: Error) => live && setFailure(error.message));
    return () => {
      live = false;
    };
  }, [session, noteKey]);

  const { week, people } = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    const counts = new Map<string, number>();
    let week = 0;
    for (const version of versions ?? []) {
      if (Date.parse(version.createdAt) >= since) week += 1;
      for (const userId of version.authorIds) counts.set(userId, (counts.get(userId) ?? 0) + 1);
    }
    return {
      week,
      people: [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([userId]) => personOf(userId))
        .filter((person): person is SheetPerson => person !== null),
    };
  }, [versions, personOf]);

  const titleOf = (noteId: string) =>
    folder.notes.find((note) => note.id === noteId)?.title || "Untitled";
  const nameOf = (userId: string) =>
    userId === session.userId ? "You" : (personOf(userId)?.name ?? "A former member");
  const recent = [...folder.notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT);
  const words = folder.notes.reduce((sum, note) => sum + note.words, 0);

  return (
    <Sheet label={folder.name} origin={origin}>
      <div className="sheet-body">
        <header className="sheet-hero">
          <span className="sheet-portrait sheet-note-glyph" data-sheet-flyer>
            <FolderOpen size={30} />
          </span>
          <h2>{folder.name}</h2>
          <p>
            {folder.parent ? (
              <>
                In{" "}
                <button
                  type="button"
                  onClick={(event) => onOpenFolder(folder.parent!.id, event.currentTarget)}
                >
                  {folder.parent.name}
                </button>
              </>
            ) : (
              "Top level"
            )}
          </p>
          {folder.children.length > 0 && (
            <span className="sheet-chips">
              {folder.children.map((child) => (
                <button
                  key={child.id}
                  type="button"
                  className="sheet-chip press"
                  onClick={(event) => onOpenFolder(child.id, event.currentTarget)}
                >
                  <Folder size={12} />
                  {child.name}
                </button>
              ))}
            </span>
          )}
        </header>

        <div className="sheet-stats">
          <button type="button" className="press" onClick={() => onShowFolder(folder.id)}>
            <small>Notes</small>
            <strong>{folder.notes.length}</strong>
          </button>
          <div>
            <small>Words</small>
            <strong>{words.toLocaleString()}</strong>
          </div>
          <div>
            <small>Changes this week</small>
            <strong>{versions ? week : "–"}</strong>
          </div>
        </div>

        <div className="sheet-work">
          {people.length > 0 && (
            <>
              <h3>Written by</h3>
              <div className="sheet-faces">
                {people.map((person) => (
                  <button
                    key={person.userId}
                    type="button"
                    className="sheet-face press"
                    onClick={(event) => onOpenPerson(person.userId, event.currentTarget)}
                  >
                    <Avatar url={person.avatarUrl} name={person.name} email="" compact />
                    {nameOf(person.userId)}
                  </button>
                ))}
              </div>
            </>
          )}

          {folder.remarks.length > 0 && (
            <>
              <h3>Open remarks</h3>
              {folder.remarks.map((remark) => (
                <button
                  key={remark.noteId}
                  type="button"
                  className="sheet-row is-stacked press"
                  onClick={() => onOpenNote(remark.noteId, { comments: true })}
                >
                  <span className="sheet-row-title">
                    <MessageSquare size={13} /> {remark.title || "Untitled"}
                  </span>
                  <span className="sheet-row-meta">
                    {remark.threads === 1
                      ? "1 conversation waiting"
                      : `${remark.threads} conversations waiting`}
                  </span>
                </button>
              ))}
            </>
          )}

          <h3>Edited lately</h3>
          {recent.length === 0 && <p className="sheet-quiet">No notes here yet.</p>}
          {recent.map((note) => (
            <button
              key={note.id}
              type="button"
              className="sheet-row press"
              onClick={() => onOpenNote(note.id)}
            >
              <span className="sheet-row-title">{note.title || "Untitled"}</span>
              <span className="sheet-row-meta">{formatDateTime(note.updatedAt)}</span>
            </button>
          ))}

          <h3>Latest versions</h3>
          {failure && (
            <p role="alert" className="sheet-quiet is-failure">
              {failure}
            </p>
          )}
          {!versions && !failure && <p className="sheet-quiet">Loading…</p>}
          {versions?.length === 0 && <p className="sheet-quiet">No versions yet.</p>}
          {versions?.slice(0, RECENT).map((version) => {
            const restore = version.label?.startsWith("Before restoring");
            return (
              <button
                key={version.id}
                type="button"
                className="sheet-row is-stacked press"
                onClick={() => onOpenNote(version.noteId, { history: version.id })}
              >
                <span className="sheet-row-title">{titleOf(version.noteId)}</span>
                {version.label && (
                  <span className="sheet-label">
                    {restore ? <RotateCcw size={11} /> : <Bookmark size={11} />}
                    {restore ? "Restored an earlier version" : version.label}
                  </span>
                )}
                <span className="sheet-row-meta">
                  {version.authorIds.map(nameOf).join(", ") || "Somebody"}
                  {" · "}
                  {formatDateTime(version.createdAt)}
                  {version.wordsAdded !== null && (
                    <>
                      {" · "}
                      <span className="is-added">+{version.wordsAdded}</span>{" "}
                      <span className="is-removed">−{version.wordsRemoved ?? 0}</span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
