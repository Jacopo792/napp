import { useCallback, useState, type MouseEvent } from "react";

/** Where a right-click landed, in viewport coordinates. */
export interface MenuPoint {
  x: number;
  y: number;
}

/** The pointer position, plus whatever the click was on. */
export function useContextMenu<T>() {
  const [target, setTarget] = useState<(MenuPoint & { item: T }) | null>(null);

  const open = useCallback((event: MouseEvent, item: T) => {
    event.preventDefault();
    event.stopPropagation();
    setTarget({ x: event.clientX, y: event.clientY, item });
  }, []);

  const close = useCallback(() => setTarget(null), []);

  return { target, open, close };
}
