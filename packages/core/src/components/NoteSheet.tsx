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
import { useEffect, useState, type ReactNode } from "react";
import { FileText, MessageSquare, Trash2 } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { SheetPortrait } from "@/components/SheetPortrait";
import { Avatar } from "@/components/WorkspaceMenus";
import type { AvatarCrop } from "@/lib/image";
import { loadVersions, type NoteVersion } from "@/lib/history";
import { formatDateTime, plural } from "@/lib/format";
import { useStoredImage } from "@/lib/media";
import type { AppSession } from "@/lib/session";
import { SafetyActions } from "./SafetyActions";

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
  personOf: (userId: string) => SheetPerson | null;
  resolveImage: (objectId: string) => Promise<Blob>;
  onOpenNote: (noteId: string, then?: { history?: string | true; comments?: boolean }) => void;
  onOpenFolder: (folderId: string) => void;
  /** The face that was pressed, for the person sheet to fly out of. */
  onOpenPerson: (userId: string) => void;
  /** Absent where this reader cannot change the note. */
  onSetPhoto?: (file: File | null, crop?: AvatarCrop) => void;
}

const RECENT = 8;

export function NoteSheet({
  session,
  note,
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
  const counts = new Map<string, number>();
  for (const version of versions ?? [])
    for (const userId of version.authorIds) counts.set(userId, (counts.get(userId) ?? 0) + 1);
  if (note.owner && !counts.has(note.owner.userId)) counts.set(note.owner.userId, 0);
  const people = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([userId]) => userId);

  const nameOf = (userId: string) =>
    userId === session.userId ? "You" : (personOf(userId)?.name ?? "A former member");

  const glyph = note.trashed ? <Trash2 size={22} /> : <FileText size={22} />;
  const face = (userId: string | undefined) => {
    const person = userId ? personOf(userId) : null;
    return person ? <Avatar url={person.avatarUrl} name={person.name} email="" compact /> : null;
  };
  const states = [
    note.trashed && "In the Trash",
    note.archived && !note.trashed && "Archived",
    note.pinned && "Pinned",
    note.lockedBy &&
      (note.lockedBy === session.userId
        ? "Only you may write it"
        : `Locked by ${nameOf(note.lockedBy)}`),
  ].filter(Boolean);

  /* One line of what happened, newest first: the last edit, every version
     with its people, and the day it began. */
  const events: SheetEvent[] = [];
  if (note.openRemarks > 0)
    events.push({
      key: "remarks",
      mark: <MessageSquare size={13} />,
      text:
        note.openRemarks === 1
          ? "1 conversation waiting"
          : `${note.openRemarks} conversations waiting`,
      onOpen: () => onOpenNote(note.id, { comments: true }),
    });
  const newest = versions?.[0]?.createdAt;
  if (!newest || Date.parse(note.updatedAt) - Date.parse(newest) > 60_000)
    events.push({
      key: "edited",
      text: "Last edited",
      meta: formatDateTime(note.updatedAt),
      onOpen: () => onOpenNote(note.id),
    });
  for (const version of versions?.slice(0, RECENT) ?? []) {
    const restore = version.label?.startsWith("Before restoring");
    const who = version.authorIds.map(nameOf).join(" and ") || "Somebody";
    events.push({
      key: version.id,
      person: version.authorIds[0],
      mark: face(version.authorIds[0]),
      text: restore
        ? `${who} restored an earlier version`
        : version.label
          ? `${who} · “${version.label}”`
          : `${who} edited`,
      meta: formatDateTime(version.createdAt),
      added: version.wordsAdded,
      removed: version.wordsRemoved,
      onOpen: () => onOpenNote(note.id, { history: version.id }),
    });
  }
  if (versions && versions.length > RECENT)
    events.push({
      key: "all",
      text: `All ${versions.length} versions`,
      onOpen: () => onOpenNote(note.id, { history: true }),
    });
  events.push({
    key: "created",
    person: note.owner?.userId,
    mark: face(note.owner?.userId),
    text: note.owner ? `${nameOf(note.owner.userId)} created it` : "Created",
    meta: formatDateTime(note.createdAt),
  });

  return (
    <Sheet label={note.title || "Untitled"}>
      <div className="sheet-body is-timeline">
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
          <div>
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
                  <button type="button" onClick={() => onOpenPerson(note.owner!.userId)}>
                    {note.owner.userId === session.userId ? "Yours" : `${note.owner.name}’s`}
                  </button>
                </>
              )}
              {states.map((state) => ` · ${state}`)}
            </p>
          </div>
        </header>

        <p className="sheet-counts">
          <button type="button" onClick={() => onOpenNote(note.id)}>
            {plural(note.words, "word")}
          </button>
          {" · "}
          <button type="button" onClick={() => onOpenNote(note.id, { history: true })}>
            {versions ? plural(versions.length, "version") : "Versions"}
          </button>
          {" · "}
          <button type="button" onClick={() => onOpenNote(note.id, { comments: true })}>
            {plural(note.openRemarks, "open remark")}
          </button>
          {people.length > 0 && " · by "}
          {people.map((userId, index) => (
            <span key={userId}>
              {index > 0 && (index === people.length - 1 ? " and " : ", ")}
              <button type="button" onClick={() => onOpenPerson(userId)}>
                {nameOf(userId)}
              </button>
            </span>
          ))}
        </p>

        <div className="sheet-work">
          {failure && (
            <p role="alert" className="sheet-quiet is-failure">
              {failure}
            </p>
          )}
          <SheetTimeline events={events} onOpenPerson={onOpenPerson} />
          {(note.linkedFrom.length > 0 || note.linksTo.length > 0) && (
            <p className="sheet-links">
              {note.linkedFrom.length > 0 && (
                <span>
                  Linked from <LinkList links={note.linkedFrom} onOpen={onOpenNote} />
                </span>
              )}
              {note.linksTo.length > 0 && (
                <span>
                  Links to <LinkList links={note.linksTo} onOpen={onOpenNote} />
                </span>
              )}
            </p>
          )}
          {note.owner?.userId !== session.userId ? (
            <SafetyActions noteId={note.id} userId={note.owner?.userId} />
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}

function LinkList({
  links,
  onOpen,
}: {
  links: { id: string; title: string }[];
  onOpen: (noteId: string) => void;
}) {
  return links.map((link, index) => (
    <span key={link.id}>
      {index > 0 && ", "}
      <button type="button" onClick={() => onOpen(link.id)}>
        {link.title || "Untitled"}
      </button>
    </span>
  ));
}

export interface SheetEvent {
  key: string;
  /** Whose face marks it; pressing the face opens them. */
  person?: string;
  mark?: ReactNode;
  text: string;
  meta?: string;
  added?: number | null;
  removed?: number | null;
  onOpen?: () => void;
}

/** What happened, newest first, on one line drawn through the faces. */
export function SheetTimeline({
  events,
  onOpenPerson,
}: {
  events: SheetEvent[];
  onOpenPerson: (userId: string) => void;
}) {
  return (
    <ol className="sheet-timeline">
      {events.map((event) => {
        const body = (
          <>
            <span className="sheet-event-text">{event.text}</span>
            {(event.meta || event.added != null) && (
              <span className="sheet-event-meta">
                {event.meta}
                {event.added != null && (
                  <>
                    {" · "}
                    <span className="is-added">+{event.added}</span>{" "}
                    <span className="is-removed">−{event.removed ?? 0}</span>
                  </>
                )}
              </span>
            )}
          </>
        );
        return (
          <li key={event.key}>
            {event.person && event.mark ? (
              <button
                type="button"
                className="sheet-event-mark is-face"
                aria-label="Open person"
                onClick={() => onOpenPerson(event.person!)}
              >
                {event.mark}
              </button>
            ) : (
              <span className="sheet-event-mark">{event.mark}</span>
            )}
            {event.onOpen ? (
              <button type="button" className="sheet-event" onClick={event.onOpen}>
                {body}
              </button>
            ) : (
              <div className="sheet-event">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
