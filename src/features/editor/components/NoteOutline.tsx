/* The note's own headings, beside the note.
 *
 * Read from the rendered document and not from the Yjs tree, and that is the
 * whole design: the panel has to know where each heading *is* on screen to say
 * which one you are reading, and the document model does not know that. One
 * source for both halves of the job — the text and the position — is one thing
 * that can be out of date instead of two.
 *
 * A `MutationObserver` on the editor keeps the list live as you type, so a
 * heading appears in the panel as it is written rather than on the next save.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ListTree, X } from "lucide-react";

interface Heading {
  id: string;
  level: number;
  text: string;
  element: HTMLElement;
}

/** How far down the pane a heading counts as "the one you are reading". A
 *  quarter of the way, not the top edge: a heading exactly at the top has
 *  already been read past. */
const READING_LINE = 0.25;

export function NoteOutline({
  scroller,
  onClose,
}: {
  scroller: HTMLElement | null;
  onClose: () => void;
}) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const collect = useCallback(() => {
    const content = scroller?.querySelector(".rich-text-content");
    if (!content) return setHeadings([]);
    setHeadings(
      [...content.querySelectorAll<HTMLElement>("h1, h2, h3")].map((element, index) => ({
        id: `${index}`,
        level: Number(element.tagName[1]),
        text: element.textContent?.trim() || "Untitled heading",
        element,
      })),
    );
  }, [scroller]);

  useEffect(() => {
    if (!scroller) return;
    collect();
    const observer = new MutationObserver(collect);
    observer.observe(scroller, { subtree: true, childList: true, characterData: true });
    return () => observer.disconnect();
  }, [scroller, collect]);

  /* Which one you are reading. Recomputed on scroll rather than watched with
     an IntersectionObserver: the question is not "which headings are visible"
     — often none are — but "which was the last one you passed", and that is a
     comparison, not an intersection. */
  useEffect(() => {
    if (!scroller) return;
    const spy = () => {
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight * READING_LINE;
      let passed: string | null = headings[0]?.id ?? null;
      for (const heading of headings) {
        if (heading.element.getBoundingClientRect().top <= line) passed = heading.id;
        else break;
      }
      setCurrent(passed);
    };
    spy();
    scroller.addEventListener("scroll", spy, { passive: true });
    return () => scroller.removeEventListener("scroll", spy);
  }, [scroller, headings]);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>(".is-current")?.scrollIntoView({ block: "nearest" });
  }, [current]);

  return (
    <aside className="note-outline" aria-label="Outline">
      <div className="note-comments-header">
        <ListTree size={15} className="text-ink-4" />
        <p className="note-comments-title">Outline</p>
        <button
          type="button"
          aria-label="Close outline"
          className="icon-button press ml-auto h-7 w-7 text-ink-3"
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </div>

      <div ref={list} className="note-outline-list">
        {headings.length === 0 && (
          <p className="note-outline-empty">
            Headings appear here as you write them. Nothing in this note is a heading yet.
          </p>
        )}
        {headings.map((heading) => (
          <button
            key={heading.id}
            type="button"
            className={`note-outline-row ${current === heading.id ? "is-current" : ""}`}
            style={{ paddingLeft: `${8 + (heading.level - 1) * 13}px` }}
            onClick={() => heading.element.scrollIntoView({ behavior: "smooth", block: "start" })}
          >
            {heading.text}
          </button>
        ))}
      </div>
    </aside>
  );
}
