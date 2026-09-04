import { useEffect, useRef } from "react";
import { platform } from "@/platform";
import { forSystem, findItem, type MenuItem } from "@/lib/menuShape";

/** Offers the menu to the window manager, and answers whether it took it.
 *  Where it did, the caller draws nothing: the menu is already on screen and
 *  is not the page's to lay out.
 *
 *  The items are read through a ref rather than closed over, so that a save
 *  landing while the menu is open does not pop a second one on the re-render
 *  that follows. It opens once, when it opens. */
export function useSystemMenu(items: MenuItem[], close: () => void): boolean {
  const popUp = platform().popUpMenu;
  const latest = useRef({ items, close });
  latest.current = { items, close };

  useEffect(() => {
    if (!popUp) return;
    let gone = false;
    void popUp(forSystem(latest.current.items)).then((id) => {
      if (gone) return;
      /* Closed first and run after: an act that opens a dialog or moves the
         selection wants the menu already gone, and the system's own menu has
         in fact been gone since the click. */
      latest.current.close();
      const chosen = id ? findItem(latest.current.items, id) : undefined;
      if (chosen?.kind === "item") chosen.run?.();
    });
    /* The system owns the menu once it is up; all this can do is stop
       answering on behalf of a component that has gone. */
    return () => {
      gone = true;
    };
  }, [popUp]);

  return !!popUp;
}
