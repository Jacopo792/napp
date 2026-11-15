import {
  Check,
  Crop as CropIcon,
  Pencil,
  Redo2,
  RotateCw,
  Smartphone,
  Undo2,
  X,
} from "@/components/icons";
import { DRAWING_BOX, type DrawingMark } from "@/features/editor/lib/content";
import {
  WHOLE_CROP,
  turnRect,
  unturnRect,
  type Crop,
  type ImageView,
} from "@/features/editor/lib/mediaInk";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PenTray } from "./PenTray";
import { MIN_CROP_SIZE, clamp, planeCss } from "./drawingGeometry";
import { STAGE_STATE } from "./useDrawingStage";
import { useInk } from "./useInk";

/* ── Drawing on a stage ──────────────────────────────────────────────────────
   A picture or a board is drawn on full-bleed: it grows out of its place in
   the note onto a black ground that covers the whole window, the pens stand
   in a tray in the bottom-left corner, and the top edge holds nothing but
   Cancel, undo and redo, and Done. The same layout on a Mac, a PC and a phone,
   because the hand is the same hand. The strokes are a draft held here: Done
   writes them to the note once, Cancel and Escape leave the document exactly
   as it was. Lent to the phone, the draft is the document itself. */

/** A motion token as the stylesheet defines it, so the panel moves on the same
 *  curve as the rest of the app and not on a copy of it. */
function motionToken(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** What a stage is drawing on: a picture in the note, or a board. */
type StageSubject =
  | { kind: "image"; src: string; alt: string; view: ImageView; natural: { w: number; h: number } }
  | { kind: "board" };

/** Lending the drawing to the phone signed into the same account. */
export interface StagePhone {
  /** A phone is listening now. */
  present: boolean;
  /** Ask it to draw this; `done` settles when it has put the pen down. */
  lend: () => { done: Promise<void>; cancel: () => void };
}

export function DrawingStage({
  subject,
  initial,
  live,
  anchor,
  phone,
  until,
  onDraft,
  onKeep,
  onClose,
}: {
  subject: StageSubject;
  initial: DrawingMark[];
  /** The document's strokes as they stand, shown while the phone holds the pen. */
  live: DrawingMark[];
  anchor: HTMLElement;
  phone?: StagePhone | null;
  /** The desk took the pen back: close, keeping what is drawn. */
  until?: Promise<void>;
  /** This stage is the phone's half of a lend: every change goes straight to
   *  the document, so the screen that asked watches the drawing arrive. */
  onDraft?: (strokes: DrawingMark[]) => void;
  /** Write the drawing to the note: on Done, and before lending it. */
  onKeep: (next: { strokes: DrawingMark[]; view: ImageView | null }) => void;
  onClose: () => void;
}) {
  const image = subject.kind === "image" ? subject : null;
  const [draft, setDraft] = useState(initial);
  const [ahead, setAhead] = useState<DrawingMark[][]>([]);
  const [behind, setBehind] = useState<DrawingMark[][]>([]);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onKeepRef = useRef(onKeep);
  onKeepRef.current = onKeep;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const write = useCallback((next: DrawingMark[]) => {
    setBehind((stack) => [...stack, draftRef.current]);
    setAhead([]);
    setDraft(next);
  }, []);
  const ink = useInk({
    strokes: draft,
    write,
    fit: image ? "width" : "board",
    editable: true,
    turned: Boolean(image),
  });
  const hand = ink.hand;
  const [crop, setCrop] = useState(image?.view.crop ?? WHOLE_CROP);
  const [spin, setSpin] = useState(image?.view.turns ?? 0);
  const [cropping, setCropping] = useState(false);
  /* The rectangle being sized, on the whole picture as it is turned now. */
  const [rect, setRect] = useState<Crop>(WHOLE_CROP);
  /* The phone has the pen: this stage only watches. */
  const [away, setAway] = useState<(() => void) | null>(null);
  const imageBox = useRef<HTMLDivElement>(null);
  const turns = ((spin % 4) + 4) % 4;
  const [leaving, setLeaving] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const ground = useRef<HTMLDivElement>(null);
  const chrome = useRef<HTMLDivElement>(null);

  /* Grows out of the block's place in the note, and goes back to it: the
     canvas travels, the ground and the controls fade. */
  const fly = useCallback(
    (entering: boolean) => {
      const element = canvas.current;
      if (!element) return Promise.resolve();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const duration = reduced ? 0 : Number.parseFloat(motionToken("--dur-slow", "360")) || 360;
      const options: KeyframeAnimationOptions = {
        duration,
        easing: motionToken("--ease-out", "ease-out"),
        fill: "both",
      };
      const from = anchor.getBoundingClientRect();
      const to = element.getBoundingClientRect();
      const small =
        from.width > 0 && to.width > 0
          ? `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`
          : "scale(0.96)";
      const frames = [{ transform: small }, { transform: "none" }];
      const fade = [{ opacity: 0 }, { opacity: 1 }];
      if (!entering) {
        frames.reverse();
        fade.reverse();
      }
      ground.current?.animate(fade, options);
      chrome.current?.animate(fade, { ...options, duration: duration * 0.6 });
      return element.animate(frames, options).finished.then(() => undefined);
    },
    [anchor],
  );
  useLayoutEffect(() => {
    void fly(true);
    window.dispatchEvent(new CustomEvent(STAGE_STATE, { detail: true }));
    return () => {
      window.dispatchEvent(new CustomEvent(STAGE_STATE, { detail: false }));
    };
  }, [fly]);

  /* Lent to the phone, the draft is the document: each change is written as
     it is made, the way a stroke on the page is. */
  const onDraftRef = useRef(onDraft);
  onDraftRef.current = onDraft;
  const firstDraft = useRef(draft);
  useEffect(() => {
    if (draft !== firstDraft.current) onDraftRef.current?.(draft);
  }, [draft]);
  const settled = useRef({ crop, rect, turns, cropping });
  settled.current = { crop, rect, turns, cropping };
  /* What Done writes. Done while sizing a crop takes the rectangle as it stands. */
  const kept = useCallback(() => {
    const now = settled.current;
    const final = now.cropping ? unturnRect(now.turns, now.rect) : now.crop;
    return { strokes: draftRef.current, view: image ? { crop: final, turns: now.turns } : null };
  }, [image]);
  const finish = useCallback(
    (commit: boolean) => {
      if (leaving) return;
      setLeaving(true);
      /* Lent, the draft was the document all along: Cancel puts it back. */
      if (!commit && draftRef.current !== firstDraft.current)
        onDraftRef.current?.(firstDraft.current);
      if (commit) onKeepRef.current(kept());
      void fly(false).then(() => onCloseRef.current());
    },
    [fly, leaving, kept],
  );
  const finishRef = useRef(finish);
  finishRef.current = finish;
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (settled.current.cropping) setCropping(false);
        else finishRef.current(false);
      }
      if (event.key.toLowerCase() === "z" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) redoRef.current();
        else undoRef.current();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const undo = () => {
    if (!behind.length) return;
    setAhead((stack) => [draft, ...stack]);
    setDraft(behind[behind.length - 1]);
    setBehind((stack) => stack.slice(0, -1));
  };
  const redo = () => {
    if (!ahead.length) return;
    setBehind((stack) => [...stack, draft]);
    setDraft(ahead[0]);
    setAhead((stack) => stack.slice(1));
  };
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;

  /* Asking the phone. The stage stays up and shows the note's own strokes as
     they arrive; the phone's Done is this stage's Done. */
  const lend = () => {
    if (!phone) return;
    /* The phone starts from what is drawn here so far. */
    onKeepRef.current(kept());
    setCropping(false);
    const asked = phone.lend();
    setAway(() => asked.cancel);
    void asked.done.then(
      () => finishRef.current(false),
      () => setAway(null),
    );
  };
  useEffect(() => () => away?.(), [away]);
  useEffect(() => {
    void until?.then(() => finishRef.current(true));
  }, [until]);
  /* While the phone has it, the canvas is the note's own strokes. */
  useEffect(() => {
    if (away) setDraft(live);
  }, [away, live]);

  const aspect = image
    ? planeCss({ crop: cropping ? WHOLE_CROP : crop, turns }, image.natural, spin).aspect
    : DRAWING_BOX.width / DRAWING_BOX.height;
  const plane = image
    ? planeCss({ crop: cropping ? WHOLE_CROP : crop, turns }, image.natural, spin)
    : null;
  const startCrop = () => {
    if (cropping) return setCropping(false);
    setRect(turnRect(turns, crop));
    setCropping(true);
  };
  const applyCrop = () => {
    setCrop(unturnRect(turns, rect));
    setCropping(false);
  };
  /* A corner, or the inside of the rectangle, followed with `window` listeners
     for the reason the ink is. */
  const grab =
    (kind: "nw" | "ne" | "sw" | "se" | "n" | "e" | "s" | "w" | "move") =>
    (event: React.PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const box = imageBox.current!.getBoundingClientRect();
      const start = rect;
      const move = (next: PointerEvent) => {
        const dx = (next.clientX - event.clientX) / box.width;
        const dy = (next.clientY - event.clientY) / box.height;
        if (kind === "move") {
          setRect({
            ...start,
            x: clamp(start.x + dx, 0, 1 - start.w),
            y: clamp(start.y + dy, 0, 1 - start.h),
          });
          return;
        }
        let [x0, y0, x1, y1] = [start.x, start.y, start.x + start.w, start.y + start.h];
        if (kind.includes("w")) x0 = clamp(x0 + dx, 0, x1 - MIN_CROP_SIZE);
        if (kind.includes("e")) x1 = clamp(x1 + dx, x0 + MIN_CROP_SIZE, 1);
        if (kind.includes("n")) y0 = clamp(y0 + dy, 0, y1 - MIN_CROP_SIZE);
        if (kind.includes("s")) y1 = clamp(y1 + dy, y0 + MIN_CROP_SIZE, 1);
        setRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };

  const surfaceClass = away
    ? ""
    : cropping
      ? ""
      : hand.erasing
        ? "is-erasing"
        : hand.shape === "move"
          ? "is-arranging"
          : "is-drawing";
  const button = (label: string, Glyph: typeof Pencil, onClick: () => void, disabled = false) => (
    <button
      type="button"
      className="draw-stage-button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Glyph size={18} />
    </button>
  );
  const surface = (
    <svg
      ref={ink.surface}
      className={`${image ? "rich-media-image-ink" : "draw-stage-board-ink"} ${surfaceClass}`}
      viewBox={`0 0 ${ink.box.width} ${ink.box.height}`}
      preserveAspectRatio={image ? "xMinYMin meet" : "none"}
      onPointerDown={away ? undefined : ink.start}
    >
      {ink.inked}
    </svg>
  );

  return createPortal(
    <div className="draw-stage" role="dialog" aria-modal="true" aria-label="Drawing">
      <div ref={ground} className="draw-stage-ground" />
      <div ref={chrome} className="draw-stage-chrome">
        <div className="draw-stage-top">
          <span className="draw-stage-group">{button("Cancel", X, () => finish(false))}</span>
          <span className="draw-stage-group">
            {!away && button("Undo", Undo2, undo, behind.length === 0)}
            {!away && button("Redo", Redo2, redo, ahead.length === 0)}
            {image && !away && button("Rotate", RotateCw, () => setSpin((n) => n + 1))}
            {image && !away && (
              <button
                type="button"
                className={`draw-stage-button ${cropping ? "is-active" : ""}`}
                aria-label="Crop"
                title="Crop"
                aria-pressed={cropping}
                onClick={startCrop}
              >
                <CropIcon size={18} />
              </button>
            )}
            {away && (
              <span className="draw-stage-away" role="status">
                <Smartphone size={16} />
                Drawing on iPhone
              </span>
            )}
          </span>
          <span className="draw-stage-group">
            {phone?.present &&
              !onDraft &&
              !away &&
              !cropping &&
              button("Draw on iPhone", Smartphone, lend)}
            {cropping ? (
              <button
                type="button"
                className="draw-stage-button is-done"
                aria-label="Crop"
                title="Crop"
                onClick={applyCrop}
              >
                <Check size={18} />
              </button>
            ) : (
              !away && (
                <button
                  type="button"
                  className="draw-stage-button is-done"
                  aria-label="Done"
                  title="Done"
                  onClick={() => finish(true)}
                >
                  <Check size={18} />
                </button>
              )
            )}
          </span>
        </div>
        {!away && !cropping && (
          <div className="draw-stage-tray">
            <PenTray hand={hand} />
          </div>
        )}
      </div>
      <div className="draw-stage-room">
        <div
          ref={canvas}
          className={`draw-stage-canvas ${image ? "" : "is-board"}`}
          style={{ ["--aspect" as string]: aspect }}
        >
          {image && plane ? (
            <div ref={imageBox} className="markup-image">
              <div className="media-plane" style={plane.style}>
                <img src={image.src} alt={image.alt || "Image"} draggable={false} />
                {surface}
              </div>
              {cropping && (
                <div className="markup-crop">
                  <span
                    className="markup-dim"
                    style={{ left: 0, top: 0, right: 0, height: `${rect.y * 100}%` }}
                  />
                  <span
                    className="markup-dim"
                    style={{ left: 0, bottom: 0, right: 0, top: `${(rect.y + rect.h) * 100}%` }}
                  />
                  <span
                    className="markup-dim"
                    style={{
                      left: 0,
                      top: `${rect.y * 100}%`,
                      width: `${rect.x * 100}%`,
                      height: `${rect.h * 100}%`,
                    }}
                  />
                  <span
                    className="markup-dim"
                    style={{
                      right: 0,
                      top: `${rect.y * 100}%`,
                      left: `${(rect.x + rect.w) * 100}%`,
                      height: `${rect.h * 100}%`,
                    }}
                  />
                  <div
                    className="markup-crop-rect"
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.w * 100}%`,
                      height: `${rect.h * 100}%`,
                    }}
                    onPointerDown={grab("move")}
                  >
                    {(["n", "e", "s", "w", "nw", "ne", "sw", "se"] as const).map((corner) => (
                      <span
                        key={corner}
                        className={`markup-handle is-${corner}`}
                        data-corner={corner}
                        onPointerDown={grab(corner)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            surface
          )}
        </div>
      </div>
      {ink.menu}
    </div>,
    document.body,
  );
}
