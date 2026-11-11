/* A sheet about one thing: a note, a folder, a person, an archive.
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
 * Then the sheet faded in about the held thing while its face or glyph flew
 * out of the row into place. That too was rejected: a window coming out of a
 * button reads as a gimmick. Now the sheet settles in where it stays — a short
 * rise and a fade, the same as Settings — and is a fixed height so what loads
 * later fills it rather than resizing it. Closing runs it backwards.
 *
 * ── The stack ───────────────────────────────────────────────────────────────
 * A name in one sheet opens another — a face in the note sheet opens the
 * person — and the way back is a Back arrow where Close is, on the other side.
 * So the sheets are a stack under one backdrop, and every sheet in it stays
 * mounted: the one underneath keeps what it loaded, and the way back finds it
 * as it was. Covered, a sheet only fades out where it stands and is `inert`;
 * the one on top arrives as a first sheet does. Back runs the top sheet's own
 * way out while the one underneath fades back in, at the same time — two
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
import { OVERLAY_IN, OVERLAY_OUT } from "@/lib/motion";

const OPEN = OVERLAY_IN;
const CLOSE = OVERLAY_OUT;

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
  className = "",
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const place = useContext(Place)!;
  const { index, shown, backdrop } = place;
  const sheetRef = useRef<HTMLElement>(null);
  const flight = useRef<Keyframe[] | null>(null);
  const leaving = useRef(false);
  const covered = index < shown;
  const onTop = index === shown;

  /* Before the first paint, so there is no frame of the sheet sitting at its
     destination before it has arrived. It settles in where it will stay — a
     short rise and a fade, like Settings. Coming out of the held row, with
     its glyph flying into place, was rejected as a gimmick. */
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || still()) return;
    flight.current = [
      { opacity: 0, transform: "translateY(8px) scale(0.985)" },
      { opacity: 1, transform: "none" },
    ];
    const rise = sheet.animate(flight.current, OPEN);
    return () => rise.cancel();
  }, []);

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
      if (!sheet || !flight.current || still()) return done();
      const options = { ...CLOSE, fill: "forwards" as const };
      const finished = [
        whole ? backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], options) : undefined,
        sheet.animate([...flight.current].reverse(), options),
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
