import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIndexLine, type IndexLinePlace } from "@/lib/useIndexLine";

/* ── Whose notes ─────────────────────────────────────────────────────────────
   The phone's notebook index at the top of the sidebar: "Your Notes",
   "Ada's Notes", the open one in ink with a 2px line under it. On the phone
   the row scrolls under a finger; in a sidebar it has to say that it does,
   because a third title cut at the column's edge looks like the end of the
   list. So the row fades at whichever edge has more behind it — the way
   Safari's tab bar does — a vertical wheel moves it sideways, the open title
   is kept in view, and ← → walk the titles once one has focus.

   The fade is a mask everywhere but Windows, where a mask costs ClearType
   (see "Movement with a cause"); there a gradient of the sidebar's own ground
   lies over the edge instead, which is the same signal without the layer. */

export interface NotebookTitle {
  id: string;
  label: string;
}

export function NotebookIndex({
  titles,
  active,
  onSelect,
  onInfo,
}: {
  titles: NotebookTitle[];
  active: string;
  onSelect: (id: string) => void;
  /** Right-click: the person's sheet, out of the title that was pressed. */
  onInfo: (id: string, element: HTMLElement) => void;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });
  const [line, placeLine] = useIndexLine(row, ".notebook-index-title.is-active");
  useEffect(() => {
    const element = row.current;
    if (!element) return;
    const measure = () => {
      const { scrollLeft, scrollWidth, clientWidth } = element;
      const start = scrollLeft > 1;
      const end = scrollLeft + clientWidth < scrollWidth - 1;
      setEdges((was) => (was.start === start && was.end === end ? was : { start, end }));
    };
    measure();
    const observer = new ResizeObserver(() => {
      measure();
      placeLine();
    });
    observer.observe(element);
    element.addEventListener("scroll", measure, { passive: true });
    /* A mouse wheel only turns vertically; the row only moves sideways. A
       trackpad's own sideways travel is left alone. Non-passive, because the
       sidebar under it would otherwise scroll as well. */
    const wheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth) return;
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", measure);
      element.removeEventListener("wheel", wheel);
    };
  }, [titles.length, placeLine]);

  /* The open notebook is never the one behind the fade. */
  useLayoutEffect(() => {
    placeLine();
    const element = row.current;
    const title = element?.querySelector<HTMLElement>(".notebook-index-title.is-active");
    if (!element || !title) return;
    const left = title.offsetLeft - 8;
    const right = title.offsetLeft + title.offsetWidth + 8;
    if (left < element.scrollLeft) element.scrollLeft = left;
    else if (right > element.scrollLeft + element.clientWidth)
      element.scrollLeft = right - element.clientWidth;
  }, [active, titles, placeLine]);

  function step(event: React.KeyboardEvent, from: number) {
    const by = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!by) return;
    event.preventDefault();
    const next = titles[(from + by + titles.length) % titles.length];
    onSelect(next.id);
    row.current
      ?.querySelectorAll<HTMLButtonElement>(".notebook-index-title")
      [titles.indexOf(next)]?.focus();
  }

  return (
    <div className="notebook-index-frame" data-fade-start={edges.start} data-fade-end={edges.end}>
      <div ref={row} role="group" aria-label="Whose notes" className="notebook-index">
        {titles.map((title, at) => {
          const on = title.id === active;
          return (
            <button
              key={title.id}
              type="button"
              onClick={() => onSelect(title.id)}
              onKeyDown={(event) => step(event, at)}
              onContextMenu={(event) => {
                event.preventDefault();
                onInfo(title.id, event.currentTarget);
              }}
              aria-pressed={on}
              title={title.label}
              className={`notebook-index-title ${on ? "is-active" : ""}`}
            >
              {title.label}
            </button>
          );
        })}
        <IndexLine line={line} className="notebook-index-line" />
      </div>
    </div>
  );
}

/** The line itself, where `useIndexLine` placed it. */
export function IndexLine({ line, className }: { line: IndexLinePlace; className: string }) {
  if (!line) return null;
  return (
    <span
      aria-hidden="true"
      className={`${className} ${line.glide ? "is-gliding" : ""}`}
      style={{ width: line.width, transform: `translateX(${line.x}px)` }}
    />
  );
}
