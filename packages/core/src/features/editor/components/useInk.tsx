import {
  DRAWING_BOX,
  DRAWING_INKS,
  DRAWING_TEXT_FONT,
  isDrawingText,
  shapeStroke,
  straightenStroke,
  strokeDistance,
  translateStroke,
  type DrawingMark,
  type DrawingStroke,
} from "@/features/editor/lib/content";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type InkTool } from "./drawingTools";

/** The ink and the nib outlive the drawing they were chosen on: picking red
 *  once should not have to be done again on the next sketch, on the next
 *  picture, or on the other surface. Module-level because it is a fact about
 *  the hand, not about any document — nothing here is ever written to a note. */
let lastInk: string = DRAWING_INKS[0];

let lastNib = 5;

let lastMarker = false;

/** What the hand is doing. `null` is the pen — the absence of a shape rather
 *  than a sixth button saying "no shape" — so pressing the shape you are
 *  holding puts it down, which is how the highlighter and the eraser beside it
 *  already work. It outlives the drawing for the same reason the ink does. */
let lastShape: InkTool | null = null;

let lastFilling = false;

/** A caption is set at the nib's own size times this. The nibs are the
 *  control that is already there for "how big", and reaching for the
 *  highlighter's thirty here would set a caption at a hundred and fifty. */
const TEXT_SCALE = 5;

/** The highlighter: one wide nib, and the chosen ink with an alpha on the end
 *  so the words underneath are still readable through it. Translucency is a
 *  property of the colour rather than a field of its own, so nothing that
 *  reads a stroke has to learn about highlighters. */
const MARKER_NIB = 30;

const MARKER_ALPHA = "59";

/** How long the pointer has to hold still at the end of a stroke before the
 *  stroke becomes the shape it was aiming at. */
const STRAIGHTEN_AFTER_MS = 450;

/* ── One hand, three surfaces ────────────────────────────────────────────────
   A board, the page itself, and a picture in the note all take the same ink in
   the same way, so they take it from here. What differs is only the box the
   strokes are measured in: a board is always 1000 × 560, and everything else
   measures both axes against its own width — which is what keeps a drawing the
   shape it was drawn as when the column it is read in is narrower.

   A stroke is gathered in local state while the pointer is down and written to
   the document once, on release. Writing per pointer event would be a Yjs
   update per pixel of a gesture, sent to the other member and persisted, for a
   line nobody has finished drawing yet.

   The pointer is followed with `window` listeners rather than
   `setPointerCapture`, for the reason the cover learned the hard way: a
   captured pointer retargets the click that follows to the capturing element,
   and every control sitting on this surface would go dead the moment somebody
   drew on it.

   ponytail: a stroke is placed against the width it was drawn on, not against
   the words under it — so a note read at another width keeps the shape of the
   drawing and loses which paragraph it was pointing at. Anchoring ink to text
   means a mark in the document, like `CommentAnchor`, and a drawing that is a
   mark is a different feature. ──────────────────────────────────────────── */
export function useInk({
  strokes,
  write,
  fit,
  editable,
  turned = false,
}: {
  strokes: DrawingMark[];
  write: (next: DrawingMark[]) => void;
  fit: "board" | "width";
  editable: boolean;
  /** The surface sits under a CSS transform (a turned or cropped picture):
   *  it is measured by layout size and read through its screen matrix, since
   *  its bounding box is no longer its shape. */
  turned?: boolean;
}) {
  const [ink, setInk] = useState<string>(lastInk);
  const [nib, setNib] = useState<number>(lastNib);
  const [marker, setMarker] = useState<boolean>(lastMarker);
  const [shape, setShape] = useState<InkTool | null>(lastShape);
  const [filling, setFilling] = useState<boolean>(lastFilling);
  const [erasing, setErasing] = useState(false);
  const [selectedStroke, setSelectedStroke] = useState<{
    stroke: DrawingMark;
    x: number;
    y: number;
  } | null>(null);
  /* A caption being typed, at the point of the page it was asked for. Held
     here and not in the document, because a caption nobody has finished is a
     caption nobody else needs to see arriving letter by letter. */
  const [composing, setComposing] = useState<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  useEffect(() => {
    if (!selectedStroke) return;
    const close = () => setSelectedStroke(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [selectedStroke]);
  const surface = useRef<SVGSVGElement>(null);
  /* The line being drawn right now is written straight onto its own element.
     It was a piece of React state, which meant a render of the whole layer for
     every pointer event of a gesture — sixty a second, each one rebuilding
     every stroke already on the surface. Nothing else on the page depends on a
     line nobody has finished, so nothing else needs to hear about it. */
  const livePath = useRef<SVGPathElement>(null);
  const paint = (d: string) => livePath.current?.setAttribute("d", d);
  const path = useRef<string>("");
  const trail = useRef<{ x: number; y: number }[]>([]);
  const snapped = useRef<string | null>(null);
  const live = useRef(strokes);
  live.current = strokes;

  /* Cleared once the committed stroke is on screen, never before it: clearing
     it in the same breath as the write leaves a frame with neither, and a line
     that blinks out at the end of every gesture. */
  useEffect(() => {
    paint("");
  }, [strokes]);

  const width = marker ? MARKER_NIB : nib;
  const laid = marker ? `${ink}${MARKER_ALPHA}` : ink;
  /* A fill is the ink with the highlighter's own alpha on it, which is the
     argument this file already makes about translucency: it is a property of
     the colour, so nothing that reads a stroke has to learn about fills any
     more than it had to learn about highlighters. It also means a filled
     shape drawn over the words still has the words under it. Only a closed
     shape can hold one — an arrow with an interior is a shape nobody drew. */
  const closed = shape === "rect" || shape === "ellipse";
  const fill = closed && filling ? `${ink}${MARKER_ALPHA}` : undefined;
  /* A caption takes the ink flat. The highlighter's alpha under a word is a
     word you cannot read, which is the opposite of what a caption is for. */
  const textSize = nib * TEXT_SCALE;

  /* What the surface is, in the units the strokes are stored in. A board is
     always the same box; anything measured against its width is as tall as
     whatever it is lying over, which nothing knows until it has been laid
     out. */
  const [aspect, setAspect] = useState(DRAWING_BOX.height / DRAWING_BOX.width);
  useEffect(() => {
    /* The element the layer is stretched over, not the layer: Chrome reports
       no resize at all for an `<svg>` sized entirely by its parent — no
       initial callback either — so a surface that measured itself stayed the
       shape of a board, and the ink landed a little below the hand. The parent
       is an ordinary box and is observed properly. */
    const element = surface.current?.parentElement;
    if (fit === "board" || !element) return;
    const measure = () => {
      const box = turned
        ? { width: element.offsetWidth, height: element.offsetHeight }
        : element.getBoundingClientRect();
      if (box.width > 0) setAspect(box.height / box.width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [fit, turned]);
  const box =
    fit === "board"
      ? DRAWING_BOX
      : { width: DRAWING_BOX.width, height: Math.max(1, Math.round(DRAWING_BOX.width * aspect)) };

  const choose = useCallback((colour: string) => {
    lastInk = colour;
    setInk(colour);
    setErasing(false);
  }, []);

  const at = useCallback(
    (event: { clientX: number; clientY: number }) => {
      if (turned) {
        const svg = surface.current;
        const matrix = svg?.getScreenCTM();
        if (!svg || !matrix) return null;
        const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
        const x = Math.round(point.x);
        const y = Math.round(point.y);
        return { x, y, at: `${x},${y}` };
      }
      const rect = surface.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      const scale = DRAWING_BOX.width / rect.width;
      const x = Math.round((event.clientX - rect.left) * scale);
      const y = Math.round(
        fit === "board"
          ? ((event.clientY - rect.top) / rect.height) * DRAWING_BOX.height
          : (event.clientY - rect.top) * scale,
      );
      return { x, y, at: `${x},${y}` };
    },
    [fit, turned],
  );

  /** The eraser takes whole strokes, not pixels of them. Half a line left
   *  behind is a line somebody has to go back for. */
  const rub = useCallback(
    (point: { x: number; y: number }) => {
      const kept = live.current.filter((mark) =>
        isDrawingText(mark)
          ? /* A caption is rubbed out by its anchor rather than by its
               outline: measuring the words would mean measuring the face, and
               a caption is one thing the way a stroke is one thing. */
            Math.hypot(mark.x - point.x, mark.y - point.y) > mark.size
          : strokeDistance(mark.d, point) >= mark.width / 2 + 10,
      );
      if (kept.length !== live.current.length) {
        live.current = kept;
        write(kept);
      }
    },
    [write],
  );

  function start(event: React.PointerEvent) {
    if (!editable || event.button !== 0) return;
    const point = at(event);
    if (!point) return;
    event.preventDefault();

    if (erasing) {
      rub(point);
      const move = (next: PointerEvent) => {
        const step = at(next);
        if (step) rub(step);
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      return;
    }

    /* A shape asked for outright. It is the same gesture the pen makes and a
       different thing to watch: the anchor stays where it went down and the
       shape is redrawn between it and wherever the pointer is now, so the
       hand is sizing one mark rather than laying a trail. Nothing is held
       still for and nothing is guessed at — which is the whole difference
       from `straightenStroke`, and the reason both exist: one is for a hand
       that was drawing and meant a rectangle, this is for a hand that came to
       draw a rectangle. */
    /* A caption is placed, not dragged: one press says where the words start,
       and the words themselves arrive from a field at that point rather than
       from the surface — an SVG takes no typing. It is portalled to the body
       and positioned by the pointer, which is what the menu beside it already
       does, so it costs none of the three surfaces a `position: relative` of
       their own. */
    if (shape === "text") {
      setComposing({ x: point.x, y: point.y, left: event.clientX, top: event.clientY });
      return;
    }

    /* Nothing. The move tool is not a thing the surface does, it is what makes
       the marks on the surface reachable — the page and a picture keep their
       ink transparent to the pointer while the pen is in hand, so that a line
       can be drawn across a line already there, and that is exactly the rule
       that has to be lifted to pick one up. A press on bare surface with it
       held is a press on nothing. */
    if (shape === "move") return;

    if (shape) {
      let last = point;
      const move = (next: PointerEvent) => {
        const step = at(next);
        if (!step) return;
        last = step;
        paint(shapeStroke(shape, point, step, width));
      };
      const finish = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
        /* A press that never travelled is somebody changing their mind, not a
           shape of no size — which on the page would be an invisible mark
           only the eraser could find. */
        if (Math.hypot(last.x - point.x, last.y - point.y) < 6) {
          paint("");
          return;
        }
        const drawn: DrawingStroke = {
          d: shapeStroke(shape, point, last, width),
          color: laid,
          width,
        };
        write([...live.current, fill ? { ...drawn, fill } : drawn]);
        paint("");
      };
      paint(shapeStroke(shape, point, point, width));
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", finish);
      window.addEventListener("pointercancel", finish);
      return;
    }

    path.current = `M${point.at}`;
    trail.current = [point];
    snapped.current = null;
    paint(path.current);

    /* Hold still at the end of a stroke and it becomes the shape it was aiming
       at. The timer is restarted by every movement, so what it measures is a
       hand that has stopped — and moving away again from a snapped shape takes
       the scrawl back, because the alternative is a shape you cannot refuse. */
    let idle = 0;
    const rearm = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(() => {
        const shape = straightenStroke(trail.current);
        if (!shape) return;
        snapped.current = shape;
        paint(shape);
      }, STRAIGHTEN_AFTER_MS);
    };
    rearm();

    const move = (next: PointerEvent) => {
      const step = at(next);
      if (!step) return;
      const last = trail.current[trail.current.length - 1];
      if (snapped.current) {
        if (Math.hypot(step.x - last.x, step.y - last.y) < 25) return;
        snapped.current = null;
      }
      trail.current.push(step);
      path.current = `${path.current}L${step.at}`;
      paint(path.current);
      rearm();
    };
    const finish = () => {
      window.clearTimeout(idle);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      /* A tap that never moved is a dot, and a dot is a stroke of one point —
         which draws nothing without a second. Give it one. */
      const committed =
        snapped.current ??
        (path.current.includes("L") ? path.current : `${path.current}L${path.current.slice(1)}`);
      path.current = "";
      trail.current = [];
      snapped.current = null;
      write([...live.current, { d: committed, color: laid, width }]);
      // A page stroke may have moved entirely to media, leaving this layer unchanged.
      paint("");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  /* Pressing a mark already meant "this one" — it is how the menu that throws
     one away is opened. Dragging from that press moves it, which needs no
     tool of its own and no mode to be in: a thing you can point at is a thing
     you can drag, and the two are told apart by whether the pointer travelled.
     The translated path is written straight onto the element being dragged,
     for the reason a line being drawn is: sixty renders a second of every
     mark on the surface, to move one of them. */
  function take(mark: DrawingMark, event: React.PointerEvent<SVGElement>) {
    event.stopPropagation();
    event.preventDefault();
    const from = at(event);
    const element = event.currentTarget;
    if (!from) return;
    /* Where the mark is put while the pointer is holding it. A caption moves
       by its anchor and a stroke by every point of its path, which is the
       only place the two differ in this whole gesture. */
    const put = (dx: number, dy: number) => {
      if (isDrawingText(mark)) {
        element.setAttribute("x", String(Math.round(mark.x + dx)));
        element.setAttribute("y", String(Math.round(mark.y + dy)));
      } else element.setAttribute("d", translateStroke(mark.d, dx, dy));
    };
    let moved = false;
    const move = (next: PointerEvent) => {
      const step = at(next);
      if (!step) return;
      const dx = step.x - from.x;
      const dy = step.y - from.y;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      put(dx, dy);
    };
    const finish = (last: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (!moved) {
        setSelectedStroke({ stroke: mark, x: event.clientX, y: event.clientY });
        return;
      }
      const step = at(last);
      if (!step) {
        put(0, 0);
        return;
      }
      const dx = step.x - from.x;
      const dy = step.y - from.y;
      write(
        live.current.map((each) =>
          each !== mark
            ? each
            : isDrawingText(each)
              ? { ...each, x: Math.round(each.x + dx), y: Math.round(each.y + dy) }
              : { ...each, d: translateStroke(each.d, dx, dy) },
        ),
      );
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  const inked = (
    <>
      {strokes.map((mark, index) =>
        isDrawingText(mark) ? (
          <text
            key={index}
            className={editable ? "ink-stroke" : undefined}
            onPointerDown={editable ? (event) => take(mark, event) : undefined}
            x={mark.x}
            y={mark.y}
            fill={mark.color}
            fontSize={mark.size}
            fontFamily={DRAWING_TEXT_FONT}
          >
            {mark.text}
          </text>
        ) : (
          <path
            key={index}
            className={editable ? "ink-stroke" : undefined}
            onPointerDown={editable ? (event) => take(mark, event) : undefined}
            d={mark.d}
            fill={mark.fill ?? "none"}
            stroke={mark.color}
            strokeWidth={mark.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}
      <path
        ref={livePath}
        d=""
        fill={fill ?? "none"}
        stroke={laid}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );

  /* The field a caption is typed into. Portalled beside the menu and for the
     same reason: an SVG takes no typing, and putting an input inside each of
     the three surfaces means a `position: relative` and a stacking context on
     each of them. Enter writes it, Escape and an empty field throw it away —
     which is also what clicking elsewhere does, because a caption you walked
     away from is a caption you did not want. */
  const composer =
    composing && editable
      ? createPortal(
          <input
            className="ink-caption-field"
            autoFocus
            aria-label="Caption"
            maxLength={280}
            style={{
              left: Math.min(composing.left, window.innerWidth - 240),
              top: Math.min(composing.top, window.innerHeight - 52),
              color: ink,
            }}
            placeholder="Caption"
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") setComposing(null);
              if (event.key !== "Enter") return;
              const text = event.currentTarget.value.trim();
              if (text)
                write([
                  ...live.current,
                  { text, x: composing.x, y: composing.y, color: ink, size: textSize },
                ]);
              setComposing(null);
            }}
            onBlur={() => setComposing(null)}
          />,
          document.body,
        )
      : null;

  const menu =
    selectedStroke && editable
      ? createPortal(
          <div
            role="menu"
            className="ink-delete-menu"
            style={{
              left: Math.min(selectedStroke.x, window.innerWidth - 175),
              top: Math.min(selectedStroke.y, window.innerHeight - 60),
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                write(live.current.filter((stroke) => stroke !== selectedStroke.stroke));
                setSelectedStroke(null);
              }}
            >
              Remove drawing
            </button>
          </div>,
          document.body,
        )
      : null;
  /* The same state and the same setters the palette above uses, for a surface
     that lays its own controls out (the picture's markup panel). */
  const hand = {
    ink,
    nib,
    marker,
    shape,
    filling,
    erasing,
    closed,
    choose,
    chooseNib(size: number) {
      lastNib = size;
      lastMarker = false;
      setNib(size);
      setMarker(false);
      setErasing(false);
    },
    toggleMarker() {
      lastMarker = !marker;
      setMarker((on) => !on);
      setErasing(false);
    },
    toggleShape(tool: InkTool) {
      const next = shape === tool ? null : tool;
      lastShape = next;
      setShape(next);
      setErasing(false);
      setComposing(null);
    },
    toggleFill() {
      lastFilling = !filling;
      setFilling((on) => !on);
    },
    toggleErase() {
      setErasing((on) => !on);
    },
    /** The plain pen: no shape, no highlighter, no eraser. */
    pen() {
      lastShape = null;
      lastMarker = false;
      setShape(null);
      setMarker(false);
      setErasing(false);
      setComposing(null);
    },
  };
  return {
    surface,
    box,
    start,
    inked,
    hand,
    erasing,
    arranging: shape === "move",
    menu: (
      <>
        {menu}
        {composer}
      </>
    ),
  };
}
