/* The chapter as it will print: cut into pages of the page setup, with its
 * running heads and numbers, and — for a document set in spreads — two pages
 * side by side, the first one alone on the right as a book opens.
 *
 * A picture of the sheet, not a second editor. The sheet is one column you
 * write down, and paginating the live editor would put every page break
 * through the binding, the carets and the drawing layer. So the chapter is
 * copied out of the sheet when this opens and laid into CSS columns exactly a
 * page high: the browser does the cutting, and each page is a window onto
 * one column of the same flow.
 *
 * ponytail: every page holds a copy of the whole flow, translated to its own
 * column — simple and exact, and heavy only for a chapter of hundreds of
 * pages. Page numbers start at 1 in each chapter, as printing one does. */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "@/components/icons";
import { fontStack, pageBox, type PageSetup } from "@/lib/spaceShape";
import type { SheetSnapshot } from "../lib/pageSnapshot";

const PX_PER_MM = 96 / 25.4;
/** Between one page's column and the next, inside the flow. Any width the
 *  pages never show: it is only how far apart the columns stand. */
const COLUMN_GAP = 80;

export function PageSpread({
  snapshot,
  page,
  book,
  chapter,
}: {
  snapshot: SheetSnapshot;
  page: PageSetup;
  book: string;
  chapter: string;
}) {
  const box = pageBox(page);
  const width = box.width * PX_PER_MM;
  const height = box.height * PX_PER_MM;
  const inner = {
    width: width - 2 * box.margin * PX_PER_MM,
    height: height - 2 * box.margin * PX_PER_MM,
  };
  const measure = useRef<HTMLDivElement>(null);
  const desk = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(1);
  const [scale, setScale] = useState(1);
  const [wanted, setWanted] = useState(1);
  const active = Math.min(wanted, count);
  const first = page.facing && active > 1 ? active - (active % 2) : active;
  const visible = page.facing && first > 1 ? [first, first + 1].filter((n) => n <= count) : [first];
  const go = (number: number) => {
    setWanted(Math.max(1, Math.min(count, number)));
    desk.current?.scrollTo({ top: 0 });
  };

  /* How many columns the flow fills, once its letters have loaded — a page
     counted in a fallback face is a page count that changes under you. */
  useLayoutEffect(() => {
    let live = true;
    const count = () => {
      const flow = measure.current;
      if (!flow || !live) return;
      setCount(
        Math.max(1, Math.round((flow.scrollWidth + COLUMN_GAP) / (inner.width + COLUMN_GAP))),
      );
    };
    count();
    const flow = measure.current;
    flow?.addEventListener("load", count, true);
    const observer = new ResizeObserver(count);
    if (flow) observer.observe(flow);
    void document.fonts.ready.then(count);
    return () => {
      live = false;
      observer.disconnect();
      flow?.removeEventListener("load", count, true);
    };
  }, [snapshot, inner.width, inner.height]);

  /* Two pages side by side are wider than most windows: the spread is shown
     smaller rather than scrolled sideways, as a print preview does. */
  const across = page.facing ? 2 : 1;
  useEffect(() => {
    const element = desk.current;
    if (!element) return;
    const fit = () =>
      setScale(Math.min(1, (element.clientWidth - 48) / (across * width + (across - 1) * 2)));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, [across, width]);

  const margin = box.margin * PX_PER_MM;
  /* The head and the number stand in the middle of the margin, over the
     edges of the text. */
  const edges = { left: margin, right: margin };
  const half = margin / 2;
  const flowStyle: CSSProperties = {
    /* Columns only cut a block: the sheet lays out as a column of flex when it
       carries footnotes, and a flex box is never cut into pages. */
    display: "block",
    padding: 0,
    width: inner.width,
    height: inner.height,
    columnWidth: inner.width,
    columnGap: COLUMN_GAP,
    columnFill: "auto",
  };
  const sheetStyle = Object.fromEntries(
    snapshot.style
      .split(";")
      .map((rule) => rule.split(/:(.*)/s).map((part) => part.trim()))
      .filter(([name, value]) => name && value)
      .map(([name, value]) => [
        name.startsWith("--")
          ? name
          : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
        value,
      ]),
  ) as CSSProperties;

  const flow = (offset: number, ref?: typeof measure) => (
    <div
      ref={ref}
      className={`${snapshot.className} page-spread-flow`}
      style={{
        ...sheetStyle,
        ...flowStyle,
        transform: offset ? `translateX(${-offset * (inner.width + COLUMN_GAP)}px)` : undefined,
      }}
      dangerouslySetInnerHTML={{ __html: snapshot.html }}
    />
  );

  return (
    <div className="page-spread-view">
      <div ref={desk} className="page-spread-desk">
        <div className="page-spread-measure" aria-hidden="true">
          {flow(0, measure)}
        </div>
        <div
          className={`page-spread-pages ${page.facing ? "is-facing" : ""} ${first === 1 ? "is-first" : ""}`}
          style={{ zoom: scale, gridTemplateColumns: `repeat(${across}, ${width}px)` }}
        >
          {visible.map((number) => {
            const index = number - 1;
            /* A book's first page is a right-hand one, so left pages are the
             even ones. */
            const left = page.facing && number % 2 === 0;
            const head = page.headers && number > 1;
            return (
              <section
                key={index}
                className={`page-spread-page ${left ? "is-left" : "is-right"}`}
                style={{ width, height, fontFamily: fontStack(page.font) ?? undefined }}
                aria-label={`Page ${number}`}
              >
                {head && (
                  <header className="page-spread-head" style={{ ...edges, top: half }}>
                    {page.facing && left ? book : chapter}
                  </header>
                )}
                <div
                  className="page-spread-window"
                  style={{ top: margin, left: margin, width: inner.width, height: inner.height }}
                >
                  {flow(index)}
                </div>
                {head && (
                  <footer className="page-spread-foot" style={{ ...edges, bottom: half }}>
                    {number}
                  </footer>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <nav className="page-spread-navigation" aria-label="Page navigation">
        <button
          type="button"
          className="ribbon-tool"
          aria-label="Previous page"
          disabled={first === 1}
          onClick={() => go(page.facing ? first - 2 : first - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <label>
          Page{" "}
          <input
            aria-label="Page number"
            type="number"
            min={1}
            max={count}
            value={active}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value >= 1) go(value);
            }}
          />
          <span> of {count}</span>
        </label>
        <button
          type="button"
          className="ribbon-tool"
          aria-label="Next page"
          disabled={visible[visible.length - 1] >= count}
          onClick={() => go(page.facing ? (first === 1 ? 2 : first + 2) : first + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </nav>
    </div>
  );
}
