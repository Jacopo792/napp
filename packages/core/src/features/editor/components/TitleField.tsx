import { useEffect, useLayoutEffect, useState } from "react";
import type * as Y from "yjs";
import { editTitle, useDraftTitle } from "@/features/editor/lib/draft";

interface Props {
  mobile: boolean;
  noteId: string;
  canEdit: boolean;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  onEdited: () => void;
  /** The collaboration server has completed a sync for this note. Until it
   *  has, an empty collaborative title is not yet an answer. */
  synced?: boolean;
  /** The live document is authoritative whenever collaboration is connected. */
  yTitle?: Y.Text | null;
}

function capitalizeSentences(text: string): string {
  return text.replace(/(^\s*[a-zà-ÿ])|([.!?]\s+[a-zà-ÿ])/g, (m) => m.toUpperCase());
}

/* The title owns its own state.

   It is a controlled field, so it has to re-render on every character — but it
   is the only thing that does. Reading the title straight from the draft store
   keeps that render inside this component instead of sending it up to the page
   and back down through the catalogue and the rail.

   Long titles are a first-class case here: the field wraps freely and grows to
   its content. It must never become fixed-height or horizontally scrolling. */

export function TitleField({
  mobile,
  noteId,
  canEdit,
  titleRef,
  onEdited,
  yTitle = null,
  synced = false,
}: Props) {
  const draftTitle = useDraftTitle(noteId);
  const [collaborativeTitle, setCollaborativeTitle] = useState(() => yTitle?.toString() ?? "");

  useEffect(() => {
    if (!yTitle) {
      setCollaborativeTitle("");
      return;
    }
    const sync = () => setCollaborativeTitle(yTitle.toString());
    sync();
    yTitle.observe(sync);
    return () => yTitle.unobserve(sync);
  }, [yTitle]);

  /* Once the server has synced, the live document is the title — including a
     title somebody deliberately emptied. Before that the page may be drawn from
     this device's own store, and an empty `yTitle` there means "not filled in
     yet", not "no title": Postgres already handed us one with the catalogue, so
     it is shown rather than a blank field that fills itself in a moment later. */
  const title = yTitle && (synced || collaborativeTitle) ? collaborativeTitle : draftTitle;

  // Keep the field tall enough for its content. Height is derived from
  // scrollHeight, so it must be recomputed after every value change and when
  // the container width changes (wrapping). The previous implementation
  // observed the parent's *height* as well, which meant every height write
  // triggered another observation and a second write (`auto` → scrollHeight)
  // on the same frame — visible as a continuous flicker while typing and, on
  // fast typing, a dropped final character when React reconciled the
  // intermediate `auto` value. Observing only *width* changes removes the
  // feedback loop.
  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [noteId, title, titleRef]);

  useEffect(() => {
    const el = titleRef.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    let lastWidth = parent.clientWidth;
    const observer = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      if (w === lastWidth) return;
      lastWidth = w;
      const target = titleRef.current;
      if (!target) return;
      target.style.height = "auto";
      target.style.height = `${target.scrollHeight}px`;
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [noteId, titleRef]);

  return (
    <textarea
      ref={titleRef}
      rows={1}
      value={title}
      onChange={(event) => {
        if (!canEdit) return;
        const el = event.target;
        const raw = el.value;
        const next = capitalizeSentences(raw);
        const start = el.selectionStart;
        const end = el.selectionEnd;
        if (yTitle) {
          yTitle.doc?.transact(() => {
            yTitle.delete(0, yTitle.length);
            yTitle.insert(0, next);
          });
          /* Yjs has the words; this says a person is putting them there. It
             used to sit only in the branch below, so with collaboration on —
             which is always — renaming a note announced nothing. `schedule()`
             on the other side of it is a no-op here: the draft store stays
             empty in this mode, so no legacy write is woken by saying so. */
          onEdited();
        } else {
          editTitle(noteId, next);
          onEdited();
        }
        if (next !== raw && start !== null && end !== null) {
          window.requestAnimationFrame(() => {
            if (document.activeElement === el) el.setSelectionRange(start, end);
          });
        }
      }}
      onInput={(event) => {
        event.currentTarget.style.height = "auto";
        event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      placeholder="Untitled"
      readOnly={!canEdit}
      lang="it"
      aria-label="Note title"
      autoCapitalize="sentences"
      autoCorrect="on"
      spellCheck
      className={`note-title font-display block w-full resize-none overflow-hidden bg-transparent text-ink outline-none placeholder:text-ink-4 ${
        mobile ? "note-title-mobile" : ""
      }`}
    />
  );
}
