import { useEffect } from "react";
import { editTitle, useDraftTitle } from "@/lib/draft";

interface Props {
  mobile: boolean;
  noteId: string;
  canEdit: boolean;
  titleRef: React.RefObject<HTMLTextAreaElement | null>;
  onEdited: () => void;
}

/* The title owns its own state.

   It is a controlled field, so it has to re-render on every character — but it
   is the only thing that does. Reading the title straight from the draft store
   keeps that render inside this component instead of sending it up to the page
   and back down through the catalogue and the rail.

   Long titles are a first-class case here: the field wraps freely and grows to
   its content. It must never become fixed-height or horizontally scrolling. */

export function TitleField({ mobile, noteId, canEdit, titleRef, onEdited }: Props) {
  const title = useDraftTitle(noteId);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [noteId, title, titleRef]);

  return (
    <textarea
      ref={titleRef}
      rows={1}
      value={title}
      onChange={(event) => {
        if (!canEdit) return;
        editTitle(noteId, event.target.value);
        onEdited();
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
      className={`note-title font-display block w-full resize-none overflow-hidden bg-transparent text-ink outline-none placeholder:text-ink-4 ${
        mobile ? "note-title-mobile" : ""
      }`}
    />
  );
}
