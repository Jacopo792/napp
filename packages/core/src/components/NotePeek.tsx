/* A note or a folder, seen while its row is held. It lives as long as the press
 * does and has nothing to press — letting go puts it away. A note shows its
 * picture, title and opening lines in its own face; a folder its latest notes.
 * Either ends on one grey line of facts. */
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useStoredImage } from "@/lib/media";
import { formatDateTime } from "@/lib/format";

const GAP = 14;

export type PeekPoint = { x: number; y: number };

/** Beside the press, on whichever side has room, and kept inside the window. */
function Peek({
  point,
  label,
  children,
}: {
  point: PeekPoint;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card) return;
    const { width, height } = card.getBoundingClientRect();
    const right = point.x + GAP + width <= window.innerWidth - GAP;
    const left = right ? point.x + GAP : Math.max(GAP, point.x - GAP - width);
    const top = Math.max(GAP, Math.min(point.y - 40, window.innerHeight - height - GAP));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.transformOrigin = `${right ? 0 : width}px ${point.y - top}px`;
  });
  return (
    <div ref={ref} className="note-peek" role="tooltip" aria-label={label}>
      {children}
    </div>
  );
}

export interface NotePeekFacts {
  title: string;
  body: string;
  photoObjectId: string | null;
  byline: string;
  words: number;
  updatedAt: string;
}

export function NotePeek({
  note,
  point,
  resolveImage,
}: {
  note: NotePeekFacts;
  point: PeekPoint;
  resolveImage: (objectId: string) => Promise<Blob>;
}) {
  const photo = useStoredImage(note.photoObjectId, resolveImage);
  return (
    <Peek point={point} label={note.title || "Untitled"}>
      {photo && <img className="note-peek-photo" src={photo} alt="" draggable={false} />}
      <div className="note-peek-page">
        <h2>{note.title || "Untitled"}</h2>
        <p>{note.body.slice(0, 700)}</p>
      </div>
      <footer className="note-peek-facts">
        {[note.byline, `${note.words.toLocaleString()} words`, formatDateTime(note.updatedAt)]
          .filter(Boolean)
          .join(" · ")}
      </footer>
    </Peek>
  );
}

export interface FolderPeekFacts {
  name: string;
  notes: { id: string; title: string; updatedAt: string }[];
  words: number;
}

const LATEST = 5;

export function FolderPeek({ folder, point }: { folder: FolderPeekFacts; point: PeekPoint }) {
  const latest = [...folder.notes]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, LATEST);
  return (
    <Peek point={point} label={folder.name}>
      <div className="note-peek-page">
        <h2>{folder.name}</h2>
        {latest.length === 0 ? (
          <p>Nothing in it yet.</p>
        ) : (
          <ol className="note-peek-list">
            {latest.map((note) => (
              <li key={note.id}>
                <span>{note.title || "Untitled"}</span>
                <time>{formatDateTime(note.updatedAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
      <footer className="note-peek-facts">
        {folder.notes.length === 1 ? "1 note" : `${folder.notes.length} notes`} ·{" "}
        {folder.words.toLocaleString()} words
      </footer>
    </Peek>
  );
}
