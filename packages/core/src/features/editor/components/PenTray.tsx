import { Check, PaintBucket, Square } from "@/components/icons";
import { DRAWING_INKS } from "@/features/editor/lib/content";
import { useEffect, useRef, useState } from "react";
import { DRAWING_NIBS, DRAWING_TOOLS } from "./drawingTools";
import type { useInk } from "./useInk";

type Hand = ReturnType<typeof useInk>["hand"];

/* ── The pen tray ────────────────────────────────────────────────────────────
   The pens stand side by side and the one in the hand is lifted out of the
   row, its tip in the ink it lays. Shapes, captions and moving a mark are one
   press further, on the square; the colour and the nib on the well beside it.
   Both open upwards, out of the tray, because the tray is at the foot of the
   screen. */
const PENS = [
  { pen: "pen", label: "Pen" },
  { pen: "marker", label: "Highlighter" },
  { pen: "eraser", label: "Eraser" },
] as const;

function Nib({ pen, ink }: { pen: (typeof PENS)[number]["pen"]; ink: string }) {
  return (
    <svg className="pen-tray-nib" viewBox="0 0 18 52" aria-hidden="true">
      {pen === "pen" && (
        <>
          <path d="M3 16 L9 2 L15 16 Z" className="pen-tray-wood" />
          <path d="M7 6.5 L9 2 L11 6.5 Z" fill={ink} />
        </>
      )}
      {pen === "marker" && (
        <>
          <path d="M4 16 L5 8 L13 5 L14 16 Z" fill={`${ink}cc`} />
        </>
      )}
      {pen === "eraser" && (
        <rect x="3" y="4" width="12" height="13" rx="4" className="pen-tray-rubber" />
      )}
      <rect x="3" y="16" width="12" height="36" rx="2.5" className="pen-tray-body" />
      {pen !== "eraser" && <rect x="3" y="20" width="12" height="3" fill={ink} />}
    </svg>
  );
}

export function PenTray({ hand, children }: { hand: Hand; children?: React.ReactNode }) {
  const [open, setOpen] = useState<"shapes" | "ink" | null>(null);
  const tray = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!tray.current?.contains(event.target as globalThis.Node)) setOpen(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const held = hand.erasing
    ? "eraser"
    : hand.shape !== null
      ? null
      : hand.marker
        ? "marker"
        : "pen";
  const custom = !DRAWING_INKS.includes(hand.ink as (typeof DRAWING_INKS)[number]);
  const ShapeGlyph =
    DRAWING_TOOLS.find((each) => each.tool === hand.shape && !hand.erasing)?.Glyph ?? Square;
  return (
    <div
      ref={tray}
      className="pen-tray"
      /* A press on a tool must not move focus: on the page layer the editor
         around it would take it, and on a phone that is the keyboard coming up
         over the pen. The colour well is a label and keeps its default, or its
         picker never opens. */
      onMouseDown={(event) => {
        if (!(event.target as Element).closest("label")) event.preventDefault();
      }}
    >
      <span className="pen-tray-pens">
        {PENS.map(({ pen, label }) => (
          <button
            key={pen}
            type="button"
            className={`pen-tray-pen ${held === pen ? "is-held" : ""}`}
            aria-label={label}
            title={label}
            aria-pressed={held === pen}
            onClick={() => {
              setOpen(null);
              if (pen === "pen") hand.pen();
              else if (pen === "marker") {
                hand.pen();
                hand.toggleMarker();
              } else if (!hand.erasing) hand.toggleErase();
            }}
          >
            <Nib pen={pen} ink={hand.ink} />
          </button>
        ))}
      </span>
      <span className="pen-tray-rule" />
      <span className="pen-tray-wrap">
        <button
          type="button"
          className={`pen-tray-tool ${held === null ? "is-active" : ""}`}
          aria-label="Shapes"
          title="Shapes"
          aria-haspopup="menu"
          aria-expanded={open === "shapes"}
          onClick={() => setOpen((now) => (now === "shapes" ? null : "shapes"))}
        >
          <ShapeGlyph size={18} />
        </button>
        {open === "shapes" && (
          <div role="menu" className="pen-tray-menu">
            {DRAWING_TOOLS.map(({ tool, label, Glyph }) => (
              <button
                key={tool}
                type="button"
                role="menuitemradio"
                aria-checked={!hand.erasing && hand.shape === tool}
                className="menu-row"
                onClick={() => {
                  if (hand.erasing) hand.toggleErase();
                  if (hand.shape !== tool) hand.toggleShape(tool);
                  setOpen(null);
                }}
              >
                <Glyph size={16} />
                {label}
                {!hand.erasing && hand.shape === tool && (
                  <Check size={14} className="pen-tray-check" />
                )}
              </button>
            ))}
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={hand.filling}
              className="menu-row"
              disabled={!hand.closed}
              onClick={hand.toggleFill}
            >
              <PaintBucket size={16} />
              Fill
              {hand.filling && <Check size={14} className="pen-tray-check" />}
            </button>
          </div>
        )}
      </span>
      <span className="pen-tray-wrap">
        <button
          type="button"
          className="pen-tray-well"
          style={{ background: hand.ink }}
          aria-label="Colour and thickness"
          title="Colour and thickness"
          aria-haspopup="menu"
          aria-expanded={open === "ink"}
          onClick={() => setOpen((now) => (now === "ink" ? null : "ink"))}
        />
        {open === "ink" && (
          <div role="menu" className="pen-tray-menu">
            <div className="pen-tray-swatches">
              {DRAWING_INKS.map((colour) => (
                <button
                  key={colour}
                  type="button"
                  role="menuitemradio"
                  className={`drawing-ink ${colour === hand.ink ? "is-chosen" : ""}`}
                  style={{ background: colour }}
                  aria-label={`Draw in ${colour}`}
                  aria-checked={colour === hand.ink}
                  onClick={() => hand.choose(colour)}
                />
              ))}
              <label
                className={`drawing-ink is-any ${custom ? "is-chosen" : ""}`}
                style={custom ? { background: hand.ink } : undefined}
                title="Any colour"
              >
                <input
                  type="color"
                  value={hand.ink}
                  aria-label="Draw in any colour"
                  onChange={(event) => hand.choose(event.target.value)}
                />
              </label>
            </div>
            <div className="pen-tray-nibs">
              {DRAWING_NIBS.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="menuitemradio"
                  aria-checked={!hand.marker && hand.nib === size}
                  aria-label={`Thickness ${size}`}
                  className={`pen-tray-size ${!hand.marker && hand.nib === size ? "is-chosen" : ""}`}
                  onClick={() => {
                    hand.chooseNib(size);
                    setOpen(null);
                  }}
                >
                  <span style={{ width: size + 2, height: size + 2 }} />
                </button>
              ))}
            </div>
          </div>
        )}
      </span>
      {children}
    </div>
  );
}
