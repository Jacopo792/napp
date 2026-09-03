import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { MenuPoint } from "@/lib/contextMenu";

/* ── The right button ────────────────────────────────────────────────────────
   Every action this application offers already existed in a menu hanging off a
   button. What was missing was the gesture people reach for first, on the thing
   they mean rather than on a control at the top of a column — so this holds the
   shell, and the menus themselves stay where they are and are handed to it.

   The panel is portalled to the body. `position: fixed` is measured against the
   nearest ancestor that has a transform, and the editor shell animates one on
   entry, so a menu opened over a note would otherwise land in the wrong place
   for the length of that animation. ───────────────────────────────────────── */

const EDGE = 8;

export function ContextMenu({
  point,
  onClose,
  width = "15rem",
  children,
}: {
  point: MenuPoint;
  onClose: () => void;
  width?: string;
  children: ReactNode;
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });

  /* Measured rather than guessed, because a submenu changes the height while
     the menu is open and a menu near the bottom edge has to move with it. */
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const read = () => {
      const box = node.getBoundingClientRect();
      const next = { w: Math.round(box.width), h: Math.round(box.height) };
      setSize((current) => (current.w === next.w && current.h === next.h ? current : next));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    /* Attached after the click that opened the menu has finished dispatching,
       so none of these can see that click and close it again immediately. */
    const away = (event: Event) => {
      if (!(event.target instanceof Node) || !document.contains(event.target)) return onClose();
      const panel = document.querySelector(".context-menu");
      if (!panel?.contains(event.target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("contextmenu", away);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    document.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("contextmenu", away);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
      document.removeEventListener("scroll", onClose, true);
    };
  }, [onClose]);

  const left = size.w
    ? Math.max(EDGE, Math.min(point.x, window.innerWidth - size.w - EDGE))
    : point.x;
  const top = size.h
    ? Math.max(EDGE, Math.min(point.y, window.innerHeight - size.h - EDGE))
    : point.y;

  return createPortal(
    <div
      ref={measure}
      role="menu"
      className="context-menu popover menu-popover p-1.5"
      style={{ left, top, width, visibility: size.h ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}
