/* Somebody in the archive, opened from their face.
 *
 * The small card answered "who is that". This answers "what has she been
 * doing", which is a question about the archive and so wants room: it grows
 * out of the face the hand held — the sheet starts as that face, at that
 * point, and becomes the sheet — and goes back into it when it closes, so the
 * way out is the way in.
 *
 * Three bands, in the order a reader asks: who and where now; how much; and
 * what, by day and by note. Nothing in it is a control except the things that
 * open a note — a row of the work opens that note with its history beside it,
 * the "now" line opens the note she has open. Last access is deliberately not
 * here: being seen is opt-in through presence, and a stored timestamp would
 * have said it anyway.
 *
 * The work is read from `note_versions`, the same rows the history panel
 * reads, so the "+120" here and the "+120" there are one number. */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Bookmark } from "@/components/icons";
import { Sheet, type SheetOrigin } from "@/components/Sheet";
import { SheetPortrait } from "@/components/SheetPortrait";
import { Avatar } from "@/components/WorkspaceMenus";
import type { AvatarCrop } from "@/lib/image";
import { loadContributions, type Contribution } from "@/lib/history";
import { memberSince } from "@/lib/format";
import { dateBucket } from "@/lib/listPreferences";
import type { AppSession } from "@/lib/session";

const WEEK_MS = 7 * 86_400_000;

export interface PersonNow {
  noteId: string;
  title: string;
  typing: boolean;
}

interface Props {
  session: AppSession;
  userId: string;
  name: string;
  avatarUrl: string | null;
  isSelf: boolean;
  joinedAt: string;
  /** The ring, the person's colour wherever they appear. */
  color: string;
  noteCount: number;
  /** Where they are, when presence says so. */
  now: PersonNow | null;
  /** Where the face was: it flies from there into the sheet, and back. */
  origin: SheetOrigin;
  titleOf: (noteId: string) => string | null;
  onOpenNote: (noteId: string, withHistory: boolean) => void;
  /** Only on your own sheet: a face is its owner's to change. */
  onSetAvatar?: (file: File, crop: AvatarCrop) => void;
}

interface NoteWork {
  noteId: string;
  changes: number;
  added: number;
  removed: number;
  labels: string[];
}

export function PersonSheet({
  session,
  userId,
  name,
  avatarUrl,
  isSelf,
  joinedAt,
  color,
  noteCount,
  now,
  origin,
  titleOf,
  onOpenNote,
  onSetAvatar,
}: Props) {
  const [work, setWork] = useState<Contribution[] | null>(null);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    let live = true;
    loadContributions(session, userId)
      .then((rows) => live && setWork(rows))
      .catch((error: Error) => live && setFailure(error.message));
    return () => {
      live = false;
    };
  }, [session, userId]);

  const { week, days } = useMemo(() => {
    const since = Date.now() - WEEK_MS;
    const week = { changes: 0, added: 0 };
    const days: { label: string; notes: NoteWork[] }[] = [];
    for (const row of work ?? []) {
      if (Date.parse(row.createdAt) >= since) {
        week.changes += 1;
        week.added += row.wordsAdded ?? 0;
      }
      const label = dateBucket(row.createdAt).label;
      let day = days.at(-1);
      if (day?.label !== label) days.push((day = { label, notes: [] }));
      let note = day.notes.find((one) => one.noteId === row.noteId);
      if (!note)
        day.notes.push(
          (note = { noteId: row.noteId, changes: 0, added: 0, removed: 0, labels: [] }),
        );
      note.changes += 1;
      note.added += row.wordsAdded ?? 0;
      note.removed += row.wordsRemoved ?? 0;
      if (row.label) note.labels.push(row.label);
    }
    return { week, days };
  }, [work]);

  return (
    <Sheet label={name} origin={origin}>
      <div className="sheet-body" style={{ "--person": color } as CSSProperties}>
        <header className="sheet-hero">
          <SheetPortrait
            className="sheet-portrait is-round"
            image={avatarUrl}
            label={onSetAvatar ? "Change picture" : "Show picture"}
            onPick={onSetAvatar}
          >
            <Avatar url={avatarUrl} name={name} email="" large />
          </SheetPortrait>
          <h2>{isSelf ? `${name} (you)` : name}</h2>
          <p>Member since {memberSince(joinedAt)}</p>
          {now && (
            <button
              type="button"
              className="sheet-now press"
              onClick={() => onOpenNote(now.noteId, false)}
            >
              {now.typing ? (
                <span className="sheet-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <span className="sheet-dot" aria-hidden="true" />
              )}
              {now.typing ? "Writing in" : "In"} <strong>{now.title || "Untitled"}</strong>
            </button>
          )}
        </header>

        <dl className="sheet-stats">
          <div>
            <dt>Notes</dt>
            <dd>{noteCount}</dd>
          </div>
          <div>
            <dt>Changes this week</dt>
            <dd>{work ? week.changes : "–"}</dd>
          </div>
          <div>
            <dt>Words this week</dt>
            <dd>{work ? `+${week.added}` : "–"}</dd>
          </div>
        </dl>

        <div className="sheet-work">
          <h3>Recent work</h3>
          {failure && (
            <p role="alert" className="sheet-quiet is-failure">
              {failure}
            </p>
          )}
          {!work && !failure && <p className="sheet-quiet">Loading…</p>}
          {work?.length === 0 && <p className="sheet-quiet">Nothing written yet.</p>}
          {days.map((day) => (
            <section key={day.label} className="sheet-day">
              <p>{day.label}</p>
              {day.notes.map((note) => {
                const title = titleOf(note.noteId);
                return (
                  <button
                    key={note.noteId}
                    type="button"
                    className="sheet-row press"
                    disabled={title === null}
                    onClick={() => onOpenNote(note.noteId, true)}
                  >
                    <span className="sheet-row-title">
                      {title === null ? "A note no longer here" : title || "Untitled"}
                    </span>
                    {note.labels.map((label) => (
                      <span key={label} className="sheet-label">
                        <Bookmark size={11} />
                        {label}
                      </span>
                    ))}
                    <span className="sheet-row-meta">
                      {note.changes === 1 ? "1 change" : `${note.changes} changes`}
                      {" · "}
                      <span className="is-added">+{note.added}</span>{" "}
                      <span className="is-removed">−{note.removed}</span>
                    </span>
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
