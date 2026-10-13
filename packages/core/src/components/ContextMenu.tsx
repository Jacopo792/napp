import { useCallback, useEffect, useState, type ReactNode } from "react";
import { MenuSurface } from "@/components/MenuSurface";
import { MenuCloseContext } from "@/components/usePresence";
import { createPortal } from "react-dom";
import type { MenuPoint } from "@/lib/contextMenu";
import type { MenuItem } from "@/lib/menuShape";
import { MenuItems } from "@/components/MenuPrimitives";
import { useSystemMenu } from "@/components/useSystemMenu";

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
  className = "",
  children,
}: {
  point: MenuPoint;
  onClose: () => void;
  width?: string;
  /** The shell is a panel at a point; what is in it decides how it is dressed
   *  and how it arrives. A menu takes the default. */
  className?: string;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState<MenuPoint | null>(null);
  const requestClose = useCallback(() => setClosing(point), [point]);
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
      if (!(event.target instanceof Node) || !document.contains(event.target))
        return requestClose();
      const panel = document.querySelector(".context-menu");
      if (!panel?.contains(event.target)) requestClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("contextmenu", away);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", requestClose);
    window.addEventListener("blur", requestClose);
    document.addEventListener("scroll", requestClose, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("contextmenu", away);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", requestClose);
      window.removeEventListener("blur", requestClose);
      document.removeEventListener("scroll", requestClose, true);
    };
  }, [requestClose]);

  const left = size.w
    ? Math.max(EDGE, Math.min(point.x, window.innerWidth - size.w - EDGE))
    : point.x;
  const top = size.h
    ? Math.max(EDGE, Math.min(point.y, window.innerHeight - size.h - EDGE))
    : point.y;

  return createPortal(
    <MenuCloseContext.Provider value={requestClose}>
      <MenuSurface
        open={closing !== point}
        onExit={onClose}
        ref={measure}
        role="menu"
        className={`context-menu popover menu-popover p-1.5 ${className}`}
        style={{ left, top, width, visibility: size.h ? "visible" : "hidden" }}
      >
        {children}
      </MenuSurface>
    </MenuCloseContext.Provider>,
    document.body,
  );
}

/** A list of items opened where the pointer is — by the window manager where
 *  the shell has one, by the page everywhere else. */
export function PointMenu({
  point,
  items,
  close,
}: {
  point: MenuPoint;
  items: MenuItem[];
  close: () => void;
}) {
  const taken = useSystemMenu(items, close);
  if (taken) return null;
  return (
    <ContextMenu point={point} onClose={close}>
      <MenuItems items={items} close={close} />
    </ContextMenu>
  );
}
