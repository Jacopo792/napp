/* A sheet that comes out of the thing that was held.
 *
 * Shared by the person sheet and the note sheet: the frame, the dismissal and
 * the motion are one decision, so they live once.
 *
 * ── The motion ──────────────────────────────────────────────────────────────
 * It was the whole sheet growing out of the face, with a spring and an
 * animated corner, and it was wrong three ways at once. A spring on a surface
 * that size overshoots the size of the window, and the window reads as
 * bouncing. A `border-radius` is a repaint on every frame, which is the lag —
 * and interpolating 999px toward 22px on a tall rectangle is a stadium and
 * then a square long before it is a card. And the sheet changed height when
 * its rows arrived, in the middle of all that.
 *
 * Now nothing that big moves far. The sheet fades in at its own place from a
 * hair smaller, on a curve with no overshoot, and is a fixed height so what
 * loads later fills it rather than resizing it. The one thing that travels is
 * the `[data-sheet-flyer]` inside it — the face, or the note's glyph — which
 * starts exactly over the thing that was held and lands in the sheet. It is
 * already the shape it is, so there is no shape to morph; and it is small, so
 * the spring it lands with reads as landing. Transform and opacity only, both
 * composited: no frame of it asks for a paint.
 *
 * Closing runs the same two animations backwards, so the way out is the way
 * in. The Web Animations API rather than keyframes in the stylesheet, because
 * where the flyer starts is a measurement, not a constant.
 *
 * ── The stack ───────────────────────────────────────────────────────────────
 * A name in one sheet opens another — a face in the note sheet opens the
 * person — and the way back is a Back arrow where Close is, on the other side.
 * So the sheets are a stack under one backdrop, and every sheet in it stays
 * mounted: the one underneath keeps what it loaded, and the face that was
 * pressed is still there for the flyer to go back into. Covered, a sheet only
 * fades out where it stands and is `inert`; the one on top comes out of the
 * face exactly as a first sheet comes out of a row. Back runs the top sheet's
 * own way out while the one underneath fades back in, at the same time — two
 * motions that are one gesture. The backdrop fades once, for the whole stack. */
import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ChevronLeft, X } from "@/components/icons";

export interface SheetOrigin {
  x: number;
  y: number;
  width: number;
  height: number;
}

const OPEN = { duration: 260, easing: "cubic-bezier(0.16, 1, 0.3, 1)" };
const FLY = { duration: 440, easing: "cubic-bezier(0.32, 1.25, 0.6, 1)" };
const SHEET_FROM = 0.94;
const CLOSE = { duration: 200, easing: "cubic-bezier(0.4, 0, 0.6, 1)" };

const still = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface StackPlace {
  index: number;
  /** The sheet the reader can see and press: the top, or during Back the one
   *  under it, already fading back in. */
  shown: number;
  backdrop: RefObject<HTMLDivElement | null>;
  /** Back has started: the sheet underneath fades in while this one leaves. */
  leave: () => void;
  back: () => void;
  close: () => void;
}

const Place = createContext<StackPlace | null>(null);

/** One backdrop for however many sheets are open; the last child is on top. */
export function SheetStack({
  onBack,
  onClose,
  children,
}: {
  onBack: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const backdrop = useRef<HTMLDivElement>(null);
  const sheets = Children.toArray(children);
  const [leaving, setLeaving] = useState(false);
  const shown = sheets.length - (leaving ? 2 : 1);

  useLayoutEffect(() => {
    if (still()) return;
    const fade = backdrop.current?.animate([{ opacity: 0 }, { opacity: 1 }], OPEN);
    return () => fade?.cancel();
  }, []);

  return (
    <div ref={backdrop} className="sheet-backdrop">
      {sheets.map((sheet, index) => (
        <Place.Provider
          key={(sheet as { key?: string }).key ?? index}
          value={{
            index,
            shown,
            backdrop,
            leave: () => setLeaving(true),
            back: () => {
              setLeaving(false);
              onBack();
            },
            close: onClose,
          }}
        >
          {sheet}
        </Place.Provider>
      ))}
    </div>
  );
}

export function Sheet({
  label,
  origin,
  className = "",
  children,
}: {
  label: string;
  origin: SheetOrigin;
  className?: string;
  children: ReactNode;
}) {
  const place = useContext(Place)!;
  const { index, shown, backdrop } = place;
  const sheetRef = useRef<HTMLElement>(null);
  const flight = useRef<{ sheet: Keyframe[]; flyer: Keyframe[] } | null>(null);
  const leaving = useRef(false);
  const covered = index < shown;
  const onTop = index === shown;

  /* Before the first paint, so there is no frame of the sheet sitting at its
     destination before it has left. Whatever a previous run started is
     cancelled on the way out: React runs this twice in development, and a
     second run that measured the flyer mid-flight would compute a flight from
     the held thing to the held thing and fight the first one. Cancelled, the
     second run measures the flyer where it really lands. */
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    const flyer = sheet?.querySelector<HTMLElement>("[data-sheet-flyer]");
    if (!sheet || still()) return;
    /* The sheet starts a hair small, scaled about the held thing itself —
       so the point the flyer starts from stays exactly where the hand was,
       and the flyer's own scale is divided by the sheet's to land on the
       held thing's size. */
    const held = { x: origin.x + origin.width / 2, y: origin.y + origin.height / 2 };
    const frame = sheet.getBoundingClientRect();
    sheet.style.transformOrigin = `${held.x - frame.x}px ${held.y - frame.y}px`;
    const box = flyer?.getBoundingClientRect();
    const start =
      box && box.width > 0
        ? `translate(${held.x - (box.x + box.width / 2)}px, ${
            held.y - (box.y + box.height / 2)
          }px) scale(${origin.width / box.width / SHEET_FROM})`
        : "scale(0.6)";
    flight.current = {
      sheet: [
        { opacity: 0, transform: `scale(${SHEET_FROM})` },
        { opacity: 1, transform: "none" },
      ],
      flyer: [{ transform: start }, { transform: "none" }],
    };
    const running = [
      sheet.animate(flight.current.sheet, OPEN),
      flyer?.animate(flight.current.flyer, FLY),
    ];
    return () => running.forEach((animation) => animation?.cancel());
  }, [origin]);

  /* Covered, the sheet fades where it stands — it does not move, it is not
     what the eye is following — and fades back the same way. The first run is
     the mount, where there is nothing to fade from. */
  const wasCovered = useRef(covered);
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || wasCovered.current === covered) return;
    wasCovered.current = covered;
    const timing = { ...OPEN, duration: still() ? 0 : OPEN.duration };
    if (covered) {
      const fade = sheet.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, fill: "forwards" });
      return () => fade.cancel();
    }
    sheet.animate([{ opacity: 0 }, { opacity: 1 }], timing);
    sheet.querySelector<HTMLElement>(".sheet-close")?.focus();
  }, [covered]);

  /* The way out is the way in, backwards. Back leaves the backdrop alone,
     because the stack is still open underneath. */
  const leave = useCallback(
    (whole: boolean) => {
      if (leaving.current) return;
      leaving.current = true;
      const done = whole ? place.close : place.back;
      if (!whole) place.leave();
      const sheet = sheetRef.current;
      const flyer = sheet?.querySelector<HTMLElement>("[data-sheet-flyer]");
      if (!sheet || !flight.current || still()) return done();
      const options = { ...CLOSE, fill: "forwards" as const };
      const finished = [
        whole ? backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], options) : undefined,
        sheet.animate([...flight.current.sheet].reverse(), options),
        flyer?.animate([...flight.current.flyer].reverse(), options),
      ].map((animation) => animation?.finished);
      /* A hidden window runs no animations and so finishes none; the sheet
         still has to go. */
      const fallback = window.setTimeout(done, CLOSE.duration + 150);
      void Promise.all(finished).then(() => {
        window.clearTimeout(fallback);
        done();
      });
    },
    [place, backdrop],
  );

  /* Only the sheet on top answers Escape and a press outside. */
  useEffect(() => {
    const ground = backdrop.current;
    if (!onTop || !ground) return;
    const escape = (event: KeyboardEvent) => event.key === "Escape" && leave(true);
    const outside = (event: MouseEvent) => event.target === ground && leave(true);
    document.addEventListener("keydown", escape);
    ground.addEventListener("mousedown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      ground.removeEventListener("mousedown", outside);
    };
  }, [onTop, leave, backdrop]);

  return (
    <section
      ref={sheetRef}
      role="dialog"
      aria-modal={onTop}
      aria-label={label}
      inert={!onTop}
      className={`sheet ${className}`}
    >
      {index > 0 && (
        <button
          type="button"
          className="sheet-back toolbar-button press"
          aria-label="Back"
          onClick={() => leave(false)}
        >
          <ChevronLeft size={16} />
        </button>
      )}
      <button
        type="button"
        className="sheet-close toolbar-button press"
        aria-label="Close"
        autoFocus
        onClick={() => leave(true)}
      >
        <X size={16} />
      </button>
      {children}
    </section>
  );
}
