/* Motion with a cause.

   Every movement here starts where something was touched and ends where the
   thing went. A note sent to the Trash travels into the Trash and the bin
   takes it; a menu grows out of the control that opened it; a picture opens
   out of its own thumbnail; the rows left behind close the gap rather than
   jumping into it. Nothing drifts a few pixels upward because it appeared —
   an entrance with no direction of its own is only a fade.

   Pure DOM, no React: the callers are event handlers and layout effects, and
   the effects outlive the components that start them (a note in flight has
   already left the list it came from). */

const reduced = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/* ── Where the hand last was ────────────────────────────────────────────────
   Read by whatever opens next, so an overlay can come out of the button that
   asked for it without every caller passing a rectangle down. A key is not a
   place: a keystroke forgets the press, and what it opens has no origin. */
interface Press {
  x: number;
  y: number;
  rect: DOMRect;
  at: number;
  /** What was pressed, so an opening can ask whether it was a note's row. */
  target: Element;
}
let press: Press | null = null;

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      const target =
        event.target instanceof Element
          ? (event.target.closest(
              "button, a, img, [role='menuitem'], [role='option'], [data-note-row]",
            ) ?? event.target)
          : null;
      press = target
        ? {
            x: event.clientX,
            y: event.clientY,
            rect: target.getBoundingClientRect(),
            at: performance.now(),
            target,
          }
        : null;
    },
    true,
  );
  document.addEventListener("keydown", () => (press = null), true);
}

function recentPress(): Press | null {
  return press && performance.now() - press.at < 1200 ? press : null;
}

/** Point the element's `transform-origin` at the control that opened it, so a
 *  CSS entrance that scales grows out of that control. */
export function originAtPress(el: HTMLElement) {
  const p = recentPress();
  if (!p) return;
  const box = el.getBoundingClientRect();
  /* The point the pointer went down on, not the middle of what it hit: a
     Settings row is as wide as the sidebar and the gear is at its left end. */
  const x = p.x - box.left;
  const y = p.y - box.top;
  el.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
}

/** A note opening out of what was pressed — its row, a card on Home, a row of
 *  Comments — the way the phone's note zooms out of its card. The new page
 *  scales up from 0.94 with its origin on the thing that was pressed, so it
 *  travels a little from there as it grows. Pressed inside the page itself, or
 *  opened from the keyboard, a link or ⌘K, there is nothing it came out of,
 *  and the page arrives as it always did. Once per element. */
const zoomed = new WeakSet<Element>();
/* The things a note is opened out of: a row of the list, and Home's cards. */
const NOTE_OPENERS = "[data-note-row], .home-continue, .home-note, .home-wait, .home-lately-row";

export function zoomNote(el: HTMLElement | null) {
  if (!el || zoomed.has(el) || reduced()) return;
  zoomed.add(el);
  const p = recentPress();
  if (!p || !p.target.matches(NOTE_OPENERS)) return;
  const box = el.getBoundingClientRect();
  const cx = p.rect.left + p.rect.width / 2;
  const cy = p.rect.top + p.rect.height / 2;
  el.style.transformOrigin = `${Math.round(cx - box.left)}px ${Math.round(cy - box.top)}px`;
  el.dataset.zoom = "";
  /* Its own animation, not one bubbling up from inside the page. */
  const done = (event: AnimationEvent) => {
    if (event.target !== el) return;
    delete el.dataset.zoom;
    el.removeEventListener("animationend", done);
  };
  el.addEventListener("animationend", done);
}

/** An overlay arriving: out of the control that asked for it, or — opened from
 *  the keyboard — from its own centre, a little smaller than it will be.
 *  `zoom` is for a picture leaving its thumbnail: the same image, the same
 *  shape, so it travels and grows instead of appearing. */
const emerged = new WeakSet<Element>();

export function emerge(el: HTMLElement | null, mode: "grow" | "zoom" = "grow") {
  /* Once per element: a ref can be attached again without the element
     having arrived again (Strict Mode does exactly that in development). */
  if (!el || emerged.has(el) || reduced()) return;
  emerged.add(el);
  const p = recentPress();
  const box = el.getBoundingClientRect();
  /* Only a thumbnail of the same shape can be the picture it grows from; a
     button that happened to open it is an origin, not a picture. */
  const same =
    p && p.rect.width > 0 && box.width > 0
      ? Math.abs(p.rect.width / p.rect.height / (box.width / box.height) - 1) < 0.2
      : false;
  if (mode === "zoom" && p && same) {
    const dx = p.rect.left + p.rect.width / 2 - (box.left + box.width / 2);
    const dy = p.rect.top + p.rect.height / 2 - (box.top + box.height / 2);
    const s = p.rect.width / box.width;
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${s})` }, { transform: "none" }], {
      duration: 420,
      easing: EASE,
    });
    return;
  }
  if (p) originAtPress(el);
  el.animate(
    [
      { opacity: 0, transform: `scale(${p ? 0.5 : 0.96})` },
      { opacity: 1, offset: 0.3 },
      { opacity: 1, transform: "none" },
    ],
    /* A cubic rather than the expo of a menu: the panel travels far enough
       that the eye has to be given the journey, not only the arrival. */
    { duration: p ? 440 : 240, easing: "cubic-bezier(0.33, 1, 0.68, 1)", fill: "backwards" },
  );
}

/* ── The rows that stay ─────────────────────────────────────────────────────
   FLIP: where every row was just before a change, then — in the layout effect
   after the list has re-rendered — each row is put back where it was and let
   go. A pinned note rises into Pinned, a trashed one's neighbours close over
   the gap, a restored one opens a space for itself. */
let snapshot: { at: number; rows: Map<string, DOMRect> } | null = null;

/* The rows and the day headings between them: a heading that stood still
   while its rows slid up under it would be the one thing in the list that
   jumped. */
const LISTED = "[data-note-row], [data-flip]";
const keyOf = (el: HTMLElement) => el.dataset.flip ?? `row:${el.dataset.noteRow}`;

export function captureRows() {
  if (typeof document === "undefined" || reduced()) return;
  const rows = new Map<string, DOMRect>();
  for (const el of document.querySelectorAll<HTMLElement>(LISTED)) {
    rows.set(keyOf(el), el.getBoundingClientRect());
  }
  snapshot = { at: performance.now(), rows };
}

export function playRows() {
  const taken = snapshot;
  if (!taken) return;
  snapshot = null;
  if (performance.now() - taken.at > 600) return;
  for (const el of document.querySelectorAll<HTMLElement>(LISTED)) {
    const before = taken.rows.get(keyOf(el));
    const now = el.getBoundingClientRect();
    if (!before) {
      el.animate(
        [
          { opacity: 0, transform: "scale(0.97)" },
          { opacity: 1, transform: "none" },
        ],
        {
          duration: 260,
          delay: 80,
          easing: EASE_OUT,
          fill: "backwards",
        },
      );
      continue;
    }
    const dx = before.left - now.left;
    const dy = before.top - now.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
      duration: 360,
      easing: EASE,
    });
  }
}

/* ── A note going somewhere ─────────────────────────────────────────────────
   A copy of the row lifts off where the row was and is thrown into the
   destination's glyph: three nested layers, because a throw is two motions
   with two curves — across fast and early, down late, as anything falls — and
   the shrink is a third. The glyph answers when it lands. */
function ghost(source: Element, from: DOMRect) {
  const outer = document.createElement("div");
  outer.className = "note-flight";
  Object.assign(outer.style, {
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
  });
  const middle = document.createElement("div");
  middle.className = "note-flight-axis";
  const card = source.cloneNode(true) as HTMLElement;
  card.removeAttribute("data-note-row");
  card.removeAttribute("id");
  card.classList.add("note-flight-card");
  card.style.transform = "";
  /* What the row becomes on the way: a blank sheet. Text shrunk to a few
     pixels is a grey smear; a page is a thing you can watch drop into a bin. */
  const sheet = document.createElement("div");
  sheet.className = "note-flight-sheet";
  card.append(sheet);
  middle.append(card);
  outer.append(middle);
  document.body.append(outer);
  return { outer, middle, card, sheet };
}

export function receive(glyph: Element) {
  glyph.classList.remove("is-receiving");
  void (glyph as HTMLElement).offsetWidth;
  glyph.classList.add("is-receiving");
  glyph.addEventListener("animationend", () => glyph.classList.remove("is-receiving"), {
    once: true,
  });
}

function sourceFor(noteId: string): Element | null {
  return (
    document.querySelector(".drag-chip") ??
    document.querySelector(`[data-note-row="${CSS.escape(noteId)}"]`)
  );
}

function fly(noteId: string, scopeId: string, delay: number): boolean {
  const source = sourceFor(noteId);
  /* The first one on screen: a closed drawer or a folded branch is not a
     place anything can be seen arriving. */
  const glyph = [...document.querySelectorAll(`[data-scope-row="${CSS.escape(scopeId)}"]`)]
    .map((row) => row.querySelector(".sidebar-glyph") ?? row)
    .find((el) => el.getBoundingClientRect().width > 0);
  if (!source || !glyph) return false;
  const from = source.getBoundingClientRect();
  const to = glyph.getBoundingClientRect();
  if (!from.width) return false;

  const { outer, middle, card, sheet } = ghost(source, from);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  /* The row folds into a page the size of a glyph — portrait, the shape of
     a note — rather than shrinking into a sliver of itself. */
  const size = (w: number, h: number) =>
    `scale(${Math.min(1, w / from.width)}, ${Math.min(1, h / from.height)})`;
  const duration = Math.min(680, 460 + Math.hypot(dx, dy) * 0.18);
  const timing = { duration, delay, fill: "both" as const };

  outer.animate([{ transform: "none" }, { transform: `translateX(${dx}px)` }], {
    ...timing,
    easing: "cubic-bezier(0.3, 0, 0.2, 1)",
  });
  middle.animate(
    [
      { transform: "none" },
      { transform: `translateY(${Math.min(0, dy) - 18}px)`, offset: 0.3 },
      { transform: `translateY(${dy}px)` },
    ],
    { ...timing, easing: "cubic-bezier(0.45, 0, 0.55, 1)" },
  );
  sheet.animate([{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 1 }], {
    ...timing,
    easing: "linear",
  });
  card
    .animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `${size(120, 64)} rotate(-3deg)`, opacity: 1, offset: 0.3 },
        { transform: `${size(18, 23)} rotate(-8deg)`, opacity: 1, offset: 0.84 },
        { transform: `${size(10, 13)} rotate(-8deg)`, opacity: 0 },
      ],
      { ...timing, easing: "linear" },
    )
    .finished.then(
      () => {
        outer.remove();
        receive(glyph);
      },
      () => outer.remove(),
    );
  return true;
}

/** Nothing to go to — deleted for good, or a destination that is not on
 *  screen. The copy lets go where it stands. */
function vanish(noteId: string, delay: number) {
  const source = sourceFor(noteId);
  if (!source) return;
  const from = source.getBoundingClientRect();
  if (!from.width) return;
  const { outer, card } = ghost(source, from);
  card
    .animate(
      [
        { transform: "none", opacity: 1, filter: "blur(0)" },
        { transform: "scale(0.94)", opacity: 0, filter: "blur(6px)" },
      ],
      { duration: 280, delay, easing: EASE_OUT, fill: "both" },
    )
    .finished.then(
      () => outer.remove(),
      () => outer.remove(),
    );
}

/** Send each note's row to the sidebar row of the place it now belongs to, or
 *  let it go in place when that place is null or not on screen and the row is
 *  leaving the list. Call before
 *  the state change, while the rows are still where they were. */
export function sendNotes(moves: { id: string; to: string | null; leaves: boolean }[]) {
  if (typeof document === "undefined" || reduced() || moves.length === 0) return;
  /* Emptying a place of a hundred notes is one gesture, not a hundred: the
     first few are thrown, the rest simply close up. */
  moves.slice(0, 6).forEach((move, i) => {
    const delay = i * 45;
    if (move.to && fly(move.id, move.to, delay)) return;
    /* A note filed into a folder that is folded away is still in this list;
       only a row that is leaving it may be seen to go. */
    if (move.leaves) vanish(move.id, delay);
  });
}

/* ── Which way a note came from ─────────────────────────────────────────────
   Opening the next note down the list is moving down a long page, so the new
   note rises into place and the old one leaves upward; the note above comes
   the other way. Set on the root, where the page's entrance and the view
   transition's exit both read it. Opened from anything that is not a row —
   a link, ⌘K, a reload — there is no direction and the note only fades. */
export function aimNote(fromId: string | null, toId: string) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const row = (id: string | null) =>
    id ? document.querySelector(`[data-note-row="${CSS.escape(id)}"]`) : null;
  const from = row(fromId);
  const to = row(toId);
  if (!from || !to || from === to) {
    delete root.dataset.noteDirection;
    return;
  }
  root.dataset.noteDirection =
    to.getBoundingClientRect().top > from.getBoundingClientRect().top ? "down" : "up";
}

/* ── A wheel that rolls ─────────────────────────────────────────────────────
   A mouse wheel moves the page in notches, and a notch delivered as one jump
   of a hundred pixels is a page that teleports: the eye loses the line it was
   reading. Each notch here sets where the page is going, and the page eases
   there over a few frames, the next notch extending the same travel rather
   than starting a new one — the way a trackpad already behaves, which is why
   a trackpad is left exactly as it is.

   Telling the two apart: Chromium reports a trackpad's `wheelDeltaY` as
   exactly three times its `deltaY`, and a wheel in whole notches of 120. Not
   sure means native: a scroll that is merely not smoothed is a scroll that
   still works. */
interface Glide {
  target: number;
  at: number;
  last: number;
  frame: number;
}
const glides = new WeakMap<HTMLElement, Glide>();

function isWheel(event: WheelEvent) {
  if (event.deltaX !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return false;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return true;
  const legacy = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  return (
    typeof legacy === "number" && legacy !== 0 && legacy % 120 === 0 && legacy !== -3 * event.deltaY
  );
}

/** The nearest box that can still move the way the wheel turned. */
function scrollerFor(start: EventTarget | null, dy: number): HTMLElement | null {
  for (
    let el = start instanceof Element ? start : null;
    el && el !== document.documentElement;
    el = el.parentElement
  ) {
    if (!(el instanceof HTMLElement)) continue;
    const style = getComputedStyle(el);
    if (style.overflowY !== "auto" && style.overflowY !== "scroll") continue;
    const max = el.scrollHeight - el.clientHeight;
    if (max < 1) continue;
    /* Snapping boxes (the page spread) place themselves; leave them alone. */
    if (style.scrollSnapType !== "none") return null;
    const at = glides.get(el)?.target ?? el.scrollTop;
    if ((dy < 0 && at > 0) || (dy > 0 && at < max - 1)) return el;
  }
  return null;
}

function roll(el: HTMLElement, dy: number) {
  const max = el.scrollHeight - el.clientHeight;
  let glide = glides.get(el);
  /* Somebody else moved it since — the scrollbar, a find, a jump to a
     heading: start from where it really is. */
  if (!glide || Math.abs(el.scrollTop - glide.at) > 2) {
    if (glide?.frame) cancelAnimationFrame(glide.frame);
    glide = { target: el.scrollTop, at: el.scrollTop, last: 0, frame: 0 };
    glides.set(el, glide);
  }
  glide.target = Math.max(0, Math.min(max, glide.target + dy));
  if (glide.frame) return;
  const g = glide;
  g.last = performance.now();
  const step = (now: number) => {
    /* Moved by something else mid-glide — a jump to a heading, a find, the
       scrollbar: that move wins, and this one stops rather than dragging the
       page back to where it was going. */
    if (Math.abs(el.scrollTop - g.at) > 2) {
      g.frame = 0;
      g.target = g.at = el.scrollTop;
      return;
    }
    /* A frame's timestamp is when the frame began, which can be before the
       moment the glide was started from inside an event: never step back. */
    const dt = Math.max(0, Math.min(48, now - g.last));
    g.last = now;
    /* A constant fraction of what is left, per unit of time: fast off the
       notch, a long settle, and no end that has to be scheduled. */
    const next = g.at + (g.target - g.at) * (1 - Math.exp(-dt / 80));
    g.at = Math.abs(g.target - next) < 0.5 ? g.target : next;
    el.scrollTo({ top: g.at, behavior: "instant" });
    g.frame = g.at === g.target ? 0 : requestAnimationFrame(step);
  };
  g.frame = requestAnimationFrame(step);
}

if (typeof document !== "undefined") {
  document.addEventListener(
    "wheel",
    (event) => {
      if (event.defaultPrevented || reduced() || !isWheel(event)) return;
      const dy =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? event.deltaY * 40
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? event.deltaY * window.innerHeight
            : event.deltaY;
      const el = scrollerFor(event.target, dy);
      if (!el) return;
      event.preventDefault();
      roll(el, dy);
    },
    { capture: true, passive: false },
  );
}

/* ── Under the chrome ───────────────────────────────────────────────────────
   Words scrolled up to a toolbar were cut off by its edge, as if the column
   were a slot in the window. They go under it now: the last few pixels of a
   scrolling column fade, at whichever end there is more to come from, by as
   much as there is — none at rest at the top, a full edge a line into the
   scroll. Written on the scroll itself, so it costs nothing until something
   moves.

   Not on Windows: a mask lifts the column into a layer of its own, and a
   transparent layer gets no ClearType — the grainy-text fault the stylesheet
   already warns about. */
const EDGED =
  ".sidebar-scroll, .collection-column [role='listbox'], .editor-scroll, .settings-scroll";
const EDGE = 28;

if (typeof document !== "undefined" && !/Windows/.test(navigator.userAgent)) {
  document.addEventListener(
    "scroll",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || !el.matches(EDGED)) return;
      /* The sidebar's top belongs to the people shelf, which sticks there;
         the note's foot belongs to the caret writing its last line. */
      const top = el.matches(".sidebar-scroll") ? 0 : Math.max(0, Math.min(EDGE, el.scrollTop));
      const bottom = el.matches(".editor-scroll")
        ? 0
        : Math.max(0, Math.min(EDGE, el.scrollHeight - el.clientHeight - el.scrollTop));
      el.style.setProperty("--edge-top", `${top}px`);
      el.style.setProperty("--edge-bottom", `${bottom}px`);
      el.toggleAttribute("data-edged", top > 0 || bottom > 0);
    },
    { capture: true, passive: true },
  );
}

/* ── Let go over nothing ────────────────────────────────────────────────────
   A note dragged and dropped where nothing takes it goes back where it came
   from, smaller and fading into its own row — the drag is undone, visibly,
   rather than the chip vanishing where the pointer happened to be. */
export function settleBack(node: HTMLElement, home: { left: number; top: number }) {
  if (reduced()) return;
  const box = node.getBoundingClientRect();
  const base = node.style.transform || "";
  const dx = home.left - box.left;
  const dy = home.top - box.top;
  /* Seen travelling the whole way and only then let into the row: a chip
     that faded as it left read as one that vanished. Longer for longer. */
  return node
    .animate(
      [
        { transform: base, opacity: 1 },
        { opacity: 1, offset: 0.75 },
        { transform: `${base} translate(${dx}px, ${dy}px) scale(0.96)`, opacity: 0 },
      ],
      {
        duration: Math.min(520, 300 + Math.hypot(dx, dy) * 0.25),
        easing: "cubic-bezier(0.3, 0, 0.2, 1)",
        fill: "forwards",
      },
    )
    .finished.then(() => {});
}
