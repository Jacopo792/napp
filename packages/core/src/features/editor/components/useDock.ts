import { useEffect, useRef, type PointerEvent } from "react";

/* ── The dock ────────────────────────────────────────────────────────────────
   A row of equal icons in a pill is a dock, so it behaves like one: the icon
   under the pointer grows, its neighbours grow less, and everything to either
   side steps out of the way rather than being overlapped.

   The stepping-aside is the half of it people notice only when it is missing —
   an icon that grows without displacing its neighbours slides under them, and
   the row reads as a rendering bug. It is not computed as a rule about
   neighbours, though: the row is simply laid out twice, once at rest and once
   at the grown widths, and each button is told the difference. Anything else
   turns into a special case about the button the pointer is straddling, which
   belongs to both sides at once.

   Each gap is the gap that was measured, not one gap taken from the first two
   icons: the header's groups carry a readout and a face between their buttons,
   so a row here is not evenly spaced and assuming it was would shift every
   icon after the wide gap.

   The expansion is centred on the cluster rather than on the pointer, which is
   what the real dock does: hovering the leftmost icon nudges the whole row
   right instead of pushing five icons off the end.

   What is measured is **layout**, never paint. `getBoundingClientRect` reports
   the box after the transforms this hook has itself written, so a pointer
   returning while the row is still animating back measured buttons 42 px wide
   that are 32 — and laid the row out around widths that were about to
   disappear, which is the shove sideways that read as the dock jittering.
   `offsetLeft` and `offsetWidth` are the geometry a transform does not touch.

   Positions are therefore kept as distances **inside the row**, and the row's
   own left edge is read afresh on every move. The row is not transformed — a
   child's transform never moves its parent's box — so that one rect is honest,
   and it follows the row when the header's readout changes width underneath
   it. ────────────────────────────────────────────────────────────── */

/** How far from the pointer the bulge reaches, in px — about three buttons. */
const DOCK_REACH = 88;
/** How much the icon directly under the pointer grows. */
const DOCK_LIFT = 0.34;

/** Smooth, and genuinely zero at the edge of the reach, so the outermost icon
 *  settles rather than stopping mid-move. */
function bump(t: number): number {
  if (t >= 1) return 0;
  const falling = 1 - t * t;
  return falling * falling;
}

/** What the row looks like with the pointer at `pointerX`: how much each item
 *  grows, and how far it steps aside to make room for its neighbours. */
export function dockLayout(
  items: { left: number; width: number }[],
  pointerX: number,
): { mag: number; shift: number }[] {
  const growth = items.map(
    (item) => DOCK_LIFT * bump(Math.abs(pointerX - (item.left + item.width / 2)) / DOCK_REACH),
  );

  // Lay the row out at the grown widths, then again at rest, in one shared
  // coordinate space; the gaps are the ones that were measured.
  let grownEdge = items.length > 0 ? items[0].left : 0;
  let total = 0;
  const offsets = items.map((item, index) => {
    const gap = index === 0 ? 0 : item.left - (items[index - 1].left + items[index - 1].width);
    const grownWidth = item.width * (1 + growth[index]);
    grownEdge += gap;
    const offset = grownEdge + grownWidth / 2 - (item.left + item.width / 2);
    grownEdge += grownWidth;
    total += item.width * growth[index];
    return offset;
  });

  // Half the total growth, taken off every button, is what centres the bulge on
  // the cluster instead of letting the row grow to the right only.
  const drift = total / 2;
  return growth.map((grown, index) => ({ mag: 1 + grown, shift: offsets[index] - drift }));
}

/** Where an element sits, with every CSS transform in its ancestry ignored:
 *  `offsetLeft` is layout and `getBoundingClientRect` is paint, and the dock
 *  writes transforms of its own. Two of these subtracted give a distance
 *  inside the row, which is what the layout is computed in. */
function layoutLeft(element: HTMLElement): number {
  let left = 0;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.offsetParent as HTMLElement | null
  ) {
    left += node.offsetLeft;
  }
  return left;
}

/** `suspended` stands the dock down — a cluster with a menu open holds still
 *  rather than sliding the button that opened it out from under the menu. */
export function useDock<T extends HTMLElement>(suspended = false) {
  const root = useRef<T>(null);
  const dock = useRef<{ button: HTMLElement; left: number; width: number }[]>([]);

  function measure() {
    const cluster = root.current;
    if (!cluster) return;
    const origin = layoutLeft(cluster);
    /* Both classes, because the formatting cluster is built out of its own
       buttons and the header's groups out of the ordinary toolbar button. A
       docked group holds nothing but its own controls, so this cannot pick up
       a button that is not in the row. */
    dock.current = [
      ...cluster.querySelectorAll<HTMLElement>(".editor-tool-button, .toolbar-button"),
    ].map((button) => ({
      button,
      left: layoutLeft(button) - origin,
      width: button.offsetWidth,
    }));
  }

  function magnify(clientX: number) {
    const items = dock.current;
    const box = root.current?.getBoundingClientRect();
    if (!box || items.length === 0) return;
    /* Tracking is instantaneous, and this class is what makes it so. A
       transition on `transform` while the pointer is moving means the row is
       permanently chasing a target it never reaches — the icons lag behind the
       cursor and rubber-band when it stops, which is not magnification, it is
       latency. The dock follows the pointer exactly, and animates only on the
       way out. */
    root.current?.classList.add("is-docked");
    dockLayout(items, clientX - box.left).forEach(({ mag, shift }, index) => {
      items[index].button.style.setProperty("--mag", String(mag));
      items[index].button.style.setProperty("--dock-shift", `${shift}px`);
    });
  }

  /* Is the pointer over the row itself? A menu opened from a docked button is
     a *descendant* of the cluster, so walking down into it never fires
     `pointerleave` and the row went on magnifying to the pointer's x while the
     cursor was two hundred pixels below it, over a menu. The row's own box is
     the only honest answer to "is this pointer on the dock". */
  function over(event: PointerEvent) {
    const box = root.current?.getBoundingClientRect();
    return (
      !!box &&
      event.clientX >= box.left &&
      event.clientX <= box.right &&
      event.clientY >= box.top &&
      event.clientY <= box.bottom
    );
  }

  function settle() {
    /* The class comes off in the same tick the properties do, so the
       transition it restores is the one that animates them back: a transition
       is read from the style *after* the change. */
    root.current?.classList.remove("is-docked");
    for (const item of dock.current) {
      item.button.style.removeProperty("--mag");
      item.button.style.removeProperty("--dock-shift");
    }
  }

  /* Standing the dock down has to put it back down: `suspended` only stops the
     handlers, so a row that was magnified when the menu opened stayed
     magnified underneath it. */
  useEffect(() => {
    if (suspended) settle();
  }, [suspended]);

  return {
    ref: root,
    settle,
    /* A finger has no position between taps, so there is nothing for a dock to
       follow: mice and trackpads only. */
    handlers: {
      onPointerEnter(event: PointerEvent) {
        if (event.pointerType !== "mouse" || suspended) return;
        measure();
        magnify(event.clientX);
      },
      onPointerMove(event: PointerEvent) {
        if (event.pointerType !== "mouse" || suspended || dock.current.length === 0) return;
        if (!over(event)) {
          settle();
          return;
        }
        magnify(event.clientX);
      },
      onPointerLeave: settle,
    },
  };
}
