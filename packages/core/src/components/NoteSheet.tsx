/* A note, opened from its row: everything about it that is not its words.
 *
 * The person sheet's sibling, in the same frame and with the same motion — the
 * note's own glyph is what flies. It gathers what was spread over four places
 * (the row's menu, the page's ⋯, the history panel and the foot of the page)
 * into one reading, in the order a reader asks:
 *
 *   what and whose — title, folder, owner, the states it is in;
 *   how much       — words, versions, open remarks;
 *   who            — everyone who has written in it;
 *   what happened  — the latest versions, named moments and restores among them;
 *   what it touches — the notes that link here and the notes it links to;
 *   when           — created and last edited.
 *
 * Everything that names something opens it: the owner opens their sheet, a
 * version opens the note with that version in its history, a remark count
 * opens the conversation, a link opens the note at the other end. The sheet is
 * a map with doors, not a page to read and close. */
import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bookmark,
  FileText,
  Lock,
  MessageSquare,
  Pin,
  RotateCcw,
  Trash2,
} from "@/components/icons";
import { Sheet, type SheetOrigin } from "@/components/Sheet";
import { SheetPortrait } from "@/components/SheetPortrait";
import { Avatar } from "@/components/WorkspaceMenus";
import type { AvatarCrop } from "@/lib/image";
import { loadVersions, type NoteVersion } from "@/lib/history";
import { formatDateTime } from "@/lib/format";
import { useStoredImage } from "@/lib/media";
import type { AppSession } from "@/lib/session";

export interface SheetPerson {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

export interface NoteSheetFacts {
  id: string;
  title: string;
  photoObjectId: string | null;
  folder: { id: string; name: string } | null;
  owner: SheetPerson | null;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  lockedBy: string | null;
  words: number;
  openRemarks: number;
  createdAt: string;
  updatedAt: string;
  linkedFrom: { id: string; title: string }[];
  linksTo: { id: string; title: string }[];
}

interface Props {
  session: AppSession;
  note: NoteSheetFacts;
  origin: SheetOrigin;
  personOf: (userId: string) => SheetPerson | null;
  resolveImage: (objectId: string) => Promise<Blob>;
  onOpenNote: (noteId: string, then?: { history?: string | true; comments?: boolean }) => void;
  onOpenFolder: (folderId: string) => void;
  /** The face that was pressed, for the person sheet to fly out of. */
  onOpenPerson: (userId: string, from: Element) => void;
  /** Absent where this reader cannot change the note. */
  onSetPhoto?: (file: File | null, crop?: AvatarCrop) => void;
}

const RECENT = 8;

export function NoteSheet({
  session,
  note,
  origin,
  personOf,
  resolveImage,
  onOpenNote,
  onOpenFolder,
  onOpenPerson,
  onSetPhoto,
}: Props) {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [failure, setFailure] = useState("");
  const photoUrl = useStoredImage(note.photoObjectId, resolveImage);

  useEffect(() => {
    let live = true;
    loadVersions(session, note.id)
      .then((list) => live && setVersions(list))
      .catch((error: Error) => live && setFailure(error.message));
    return () => {
      live = false;
    };
  }, [session, note.id]);

  /* Everyone with a hand in it, the most active first; the owner leads even
     with no version yet, because the note is in their scope. */
  const people = useMemo(() => {
    const counts = new Map<string, number>();
    for (const version of versions ?? [])
      for (const userId of version.authorIds) counts.set(userId, (counts.get(userId) ?? 0) + 1);
    if (note.owner && !counts.has(note.owner.userId)) counts.set(note.owner.userId, 0);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([userId]) => personOf(userId))
      .filter((person): person is SheetPerson => person !== null);
  }, [versions, note.owner, personOf]);

  const nameOf = (userId: string) =>
    userId === session.userId ? "You" : (personOf(userId)?.name ?? "A former member");

  const glyph = note.trashed ? <Trash2 size={30} /> : <FileText size={30} />;

  return (
    <Sheet label={note.title || "Untitled"} origin={origin}>
      <div className="sheet-body">
        <header className="sheet-hero">
          <SheetPortrait
            className="sheet-portrait sheet-note-glyph"
            image={photoUrl}
            label={onSetPhoto ? "Note photo" : "Show photo"}
            onPick={onSetPhoto}
            onRemove={onSetPhoto && (() => onSetPhoto(null))}
          >
            {photoUrl ? <img src={photoUrl} alt="" draggable={false} /> : glyph}
          </SheetPortrait>
          <h2>{note.title || "Untitled"}</h2>
          <p>
            {note.folder ? (
              <button type="button" onClick={() => onOpenFolder(note.folder!.id)}>
                {note.folder.name}
              </button>
            ) : (
              "No folder"
            )}
            {note.owner && (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={(event) => onOpenPerson(note.owner!.userId, event.currentTarget)}
                >
                  {note.owner.userId === session.userId ? "Yours" : `${note.owner.name}’s`}
                </button>
              </>
            )}
          </p>
          {(note.pinned || note.archived || note.trashed || note.lockedBy) && (
            <span className="sheet-chips">
              {note.trashed && (
                <span className="sheet-chip">
                  <Trash2 size={12} />
                  In the Trash
                </span>
              )}
              {note.archived && !note.trashed && (
                <span className="sheet-chip">
                  <Archive size={12} />
                  Archived
                </span>
              )}
              {note.pinned && (
                <span className="sheet-chip">
                  <Pin size={12} />
                  Pinned
                </span>
              )}
              {note.lockedBy && (
                <span className="sheet-chip">
                  <Lock size={12} />
                  {note.lockedBy === session.userId
                    ? "Only you may write it"
                    : `Locked by ${nameOf(note.lockedBy)}`}
                </span>
              )}
            </span>
          )}
        </header>

        <div className="sheet-stats">
          <button type="button" className="press" onClick={() => onOpenNote(note.id)}>
            <small>Words</small>
            <strong>{note.words.toLocaleString()}</strong>
          </button>
          <button
            type="button"
            className="press"
            onClick={() => onOpenNote(note.id, { history: true })}
          >
            <small>Versions</small>
            <strong>{versions ? versions.length : "–"}</strong>
          </button>
          <button
            type="button"
            className="press"
            onClick={() => onOpenNote(note.id, { comments: true })}
          >
            <small>Open remarks</small>
            <strong>{note.openRemarks}</strong>
          </button>
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

          <h3>
            History
            {versions && versions.length > RECENT && (
              <button type="button" onClick={() => onOpenNote(note.id, { history: true })}>
                All {versions.length}
              </button>
            )}
          </h3>
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
                className="sheet-row press"
                onClick={() => onOpenNote(note.id, { history: version.id })}
              >
                <span className="sheet-row-title">
                  {version.authorIds.map(nameOf).join(", ") || "Somebody"}
                </span>
                {version.label && (
                  <span className="sheet-label">
                    {restore ? <RotateCcw size={11} /> : <Bookmark size={11} />}
                    {restore ? "Restored an earlier version" : version.label}
                  </span>
                )}
                <span className="sheet-row-meta">
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

          {note.openRemarks > 0 && (
            <button
              type="button"
              className="sheet-row press"
              onClick={() => onOpenNote(note.id, { comments: true })}
            >
              <span className="sheet-row-title">
                <MessageSquare size={13} />{" "}
                {note.openRemarks === 1
                  ? "1 conversation waiting"
                  : `${note.openRemarks} conversations waiting`}
              </span>
            </button>
          )}

          {note.linkedFrom.length > 0 && (
            <>
              <h3>Linked from</h3>
              {note.linkedFrom.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className="sheet-row press"
                  onClick={() => onOpenNote(link.id)}
                >
                  <span className="sheet-row-title">{link.title || "Untitled"}</span>
                </button>
              ))}
            </>
          )}

          {note.linksTo.length > 0 && (
            <>
              <h3>Links to</h3>
              {note.linksTo.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  className="sheet-row press"
                  onClick={() => onOpenNote(link.id)}
                >
                  <span className="sheet-row-title">{link.title || "Untitled"}</span>
                </button>
              ))}
            </>
          )}

          <h3>Dates</h3>
          <dl className="sheet-facts">
            <dt>Created</dt>
            <dd>{formatDateTime(note.createdAt)}</dd>
            <dt>Last edited</dt>
            <dd>{formatDateTime(note.updatedAt)}</dd>
          </dl>
        </div>
      </div>
    </Sheet>
  );
}
