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
import { FolderOpen, MessageSquare } from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { SheetTimeline, type SheetEvent, type SheetPerson } from "@/components/NoteSheet";
import { Avatar } from "@/components/WorkspaceMenus";
import { loadFolderVersions, type FolderVersion } from "@/lib/history";
import { formatDateTime, plural } from "@/lib/format";
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
  personOf: (userId: string) => SheetPerson | null;
  onShowFolder: (folderId: string) => void;
  /** Another folder's sheet, flying out of the name that was pressed. */
  onOpenFolder: (folderId: string) => void;
  onOpenNote: (noteId: string, then?: { history?: string | true; comments?: boolean }) => void;
  onOpenPerson: (userId: string) => void;
}

export function FolderSheet({
  session,
  folder,
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
  const words = folder.notes.reduce((sum, note) => sum + note.words, 0);

  /* What happened in it, newest first: the conversations waiting, then every
     version and every note edited lately on one line. */
  const events: SheetEvent[] = folder.remarks.map((remark) => ({
    key: `remark-${remark.noteId}`,
    mark: <MessageSquare size={13} />,
    text: remark.title || "Untitled",
    meta:
      remark.threads === 1 ? "1 conversation waiting" : `${remark.threads} conversations waiting`,
    onOpen: () => onOpenNote(remark.noteId, { comments: true }),
  }));
  const shown = versions?.slice(0, RECENT) ?? [];
  const happened: (SheetEvent & { at: string })[] = shown.map((version) => {
    const restore = version.label?.startsWith("Before restoring");
    const who = version.authorIds.map(nameOf).join(" and ") || "Somebody";
    const person = personOf(version.authorIds[0] ?? "");
    return {
      key: version.id,
      at: version.createdAt,
      person: person?.userId,
      mark: person && <Avatar url={person.avatarUrl} name={person.name} email="" compact />,
      text: titleOf(version.noteId),
      meta: `${restore ? `${who} restored it` : version.label ? `${who} · “${version.label}”` : who} · ${formatDateTime(version.createdAt)}`,
      added: version.wordsAdded,
      removed: version.wordsRemoved,
      onOpen: () => onOpenNote(version.noteId, { history: version.id }),
    };
  });
  for (const note of [...folder.notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, RECENT))
    if (!shown.some((version) => version.noteId === note.id))
      happened.push({
        key: `note-${note.id}`,
        at: note.updatedAt,
        text: note.title || "Untitled",
        meta: `Edited ${formatDateTime(note.updatedAt)}`,
        onOpen: () => onOpenNote(note.id),
      });
  happened.sort((a, b) => b.at.localeCompare(a.at));
  events.push(...happened);

  return (
    <Sheet label={folder.name}>
      <div className="sheet-body is-timeline">
        <header className="sheet-hero">
          <span className="sheet-portrait sheet-note-glyph">
            <FolderOpen size={22} />
          </span>
          <div>
            <h2>{folder.name}</h2>
            <p>
              {folder.parent ? (
                <>
                  In{" "}
                  <button type="button" onClick={() => onOpenFolder(folder.parent!.id)}>
                    {folder.parent.name}
                  </button>
                </>
              ) : (
                "Top level"
              )}
              {folder.children.length > 0 && " · holds "}
              {folder.children.map((child, index) => (
                <span key={child.id}>
                  {index > 0 && ", "}
                  <button type="button" onClick={() => onOpenFolder(child.id)}>
                    {child.name}
                  </button>
                </span>
              ))}
            </p>
          </div>
        </header>

        <p className="sheet-counts">
          <button type="button" onClick={() => onShowFolder(folder.id)}>
            {plural(folder.notes.length, "note")}
          </button>
          {` · ${plural(words, "word")} · `}
          {versions ? plural(week, "change") : "Changes"} this week
          {people.length > 0 && " · by "}
          {people.map((person, index) => (
            <span key={person.userId}>
              {index > 0 && (index === people.length - 1 ? " and " : ", ")}
              <button type="button" onClick={() => onOpenPerson(person.userId)}>
                {nameOf(person.userId)}
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
          {events.length === 0 ? (
            <p className="sheet-quiet">{versions ? "No notes here yet." : "Loading…"}</p>
          ) : (
            <SheetTimeline events={events} onOpenPerson={onOpenPerson} />
          )}
        </div>
      </div>
    </Sheet>
  );
}
