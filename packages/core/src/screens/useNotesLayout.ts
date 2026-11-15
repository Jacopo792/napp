import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  LIST_DEFAULT,
  LIST_MAX,
  LIST_MIN,
  LIST_WIDTH_KEY,
  SIDEBAR_DEFAULT,
  SIDEBAR_MAX,
  SIDEBAR_MIN,
  SIDEBAR_WIDTH_KEY,
  loadPaneWidth,
  paneWidths,
  panesToHide,
} from "@/lib/paneLayout";

/** The folders, the list and focus mode around the open note: whether each
 *  pane is out, how wide, and the slides between those states. */
export function useNotesLayout(windowWidth: number, compact: boolean) {
  const [navigationOpen, setNavigationOpen] = useState(() => {
    try {
      return localStorage.getItem("napp:navigation") !== "closed";
    } catch {
      return true;
    }
  });
  const [sidebarWidth, setSidebarWidth] = useState(() =>
    loadPaneWidth(SIDEBAR_WIDTH_KEY, SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
  );
  const [listWidth, setListWidth] = useState(() =>
    loadPaneWidth(LIST_WIDTH_KEY, LIST_DEFAULT, LIST_MIN, LIST_MAX),
  );
  /* Focus is the two panes put away and the page's own controls stepping back
     while you write. It is not a third layout: the workspace already knows how
     to run without the rail and the list, so this is that state plus a way in
     that is not a small button in a corner, plus a class the stylesheet reads. */
  const [focusMode, setFocusMode] = useState(false);
  /* A docked column (comments, history, outline, inspector) is open, and which
     panes it asked to be put away to keep the note readable. */
  const [dockedPanel, setDockedPanel] = useState(false);
  const [listAutoHidden, setListAutoHidden] = useState(false);
  const autoHidden = useRef({ sidebar: false, handled: false });

  useEffect(() => {
    try {
      localStorage.setItem("napp:navigation", navigationOpen ? "open" : "closed");
    } catch {
      /* The preference is optional; writing still works without local storage. */
    }
  }, [navigationOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(sidebarWidth)));
      localStorage.setItem(LIST_WIDTH_KEY, String(Math.round(listWidth)));
    } catch {
      /* Pane sizing is a convenience; the archive never depends on it. */
    }
  }, [sidebarWidth, listWidth]);

  /* Focus puts the two panes away and gives them back on the way out — the
     rail's own open state is remembered across the trip, because whether you
     had it open is a different question from whether you are focusing. */
  const restoreNavigation = useRef(true);
  /* The slide is a view transition: the new layout is worked out once, and
     what travels for the next 360ms is two pictures of it on the compositor.
     It was a transition on the slot's `width`, which re-laid the whole note —
     and re-ran its container queries — on every frame of the way, and could
     not leave the width alone while `PaneResizer` was dragging it either.
     `also` is for a change that has to land in the same frame, so the
     picture taken after it is the finished one. */
  const changeNavigation = useCallback(
    (next: boolean | ((current: boolean) => boolean), also?: () => void) => {
      const apply = () =>
        flushSync(() => {
          setNavigationOpen(next);
          also?.();
        });
      if (
        !document.startViewTransition ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        apply();
        return;
      }
      const root = document.documentElement;
      root.classList.add("is-sliding-navigation");
      document
        .startViewTransition(apply)
        .finished.finally(() => root.classList.remove("is-sliding-navigation"));
    },
    [],
  );

  const toggleFocus = useCallback(() => {
    if (focusMode) {
      changeNavigation(restoreNavigation.current, () => setFocusMode(false));
      return;
    }
    restoreNavigation.current = navigationOpen;
    changeNavigation(false, () => setFocusMode(true));
  }, [focusMode, navigationOpen, changeNavigation]);

  /* A window too narrow for the panes the reader set is not a reason to forget
     them — see `paneWidths`. */
  const { sidebarShown, listShown, sidebarMax, listMax } = paneWidths(
    windowWidth,
    sidebarWidth,
    listWidth,
  );
  const listOpen = (navigationOpen || !focusMode) && !listAutoHidden;

  /* The note keeps a readable column beside a docked panel. Opening one that
     would squeeze it puts the folders away, then the list, with the same slide
     as the toggles; closing it brings back only what it put away. Looked at
     once per opening, so a pane the reader shows or hides meanwhile is theirs. */
  useEffect(() => {
    const auto = autoHidden.current;
    if (!dockedPanel) {
      if (!auto.handled) return;
      auto.handled = false;
      if (auto.sidebar && !navigationOpen) changeNavigation(true);
      auto.sidebar = false;
      setListAutoHidden(false);
      return;
    }
    if (compact || focusMode || auto.handled) return;
    auto.handled = true;
    const hide = panesToHide(
      windowWidth,
      { open: navigationOpen, width: sidebarShown },
      { open: listOpen, width: listShown },
    );
    if (hide.sidebar) {
      auto.sidebar = true;
      changeNavigation(false);
    }
    if (hide.list) setListAutoHidden(true);
  }, [
    dockedPanel,
    compact,
    focusMode,
    navigationOpen,
    listOpen,
    windowWidth,
    sidebarShown,
    listShown,
    changeNavigation,
  ]);
  /* Showing the folders by hand is the reader's say: it is not undone. */
  useEffect(() => {
    if (navigationOpen) {
      autoHidden.current.sidebar = false;
      setListAutoHidden(false);
    }
  }, [navigationOpen]);

  return {
    navigationOpen,
    changeNavigation,
    focusMode,
    toggleFocus,
    setDockedPanel,
    listOpen,
    sidebarShown,
    listShown,
    sidebarMax,
    listMax,
    setSidebarWidth,
    setListWidth,
  };
}
