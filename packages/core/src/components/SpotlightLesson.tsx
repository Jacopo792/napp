import { useEffect, type CSSProperties } from "react";
import { Search } from "@/components/icons";
import { keyName } from "@/lib/shortcuts";

/* The Spotlight, drawn where it opens, with its shortcut where the words would
   be. Nothing here closes it: the window's own ⌘K / Ctrl+K handler opens the
   real Spotlight in the same place, and that press is what records it learned. */
export function SpotlightLesson() {
  /* A caret left in the text would take ⌘K as "link these words". */
  useEffect(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, []);

  const keys = keyName("⌘K").split(/\+|(?<=⌘)/);
  return (
    <div className="palette-layer is-spotlight spotlight-lesson" role="presentation">
      <div className="settings-scrim" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Press ${keys.join(" ")}`}
        className="liquid spotlight"
      >
        <div className="liquid-card glass-sheet">
          <div className="palette-search">
            <Search size={18} />
            <span className="spotlight-lesson-word">Press</span>
            <span className="spotlight-lesson-keys">
              {keys.map((key, index) => (
                <kbd key={key} style={{ "--key": index } as CSSProperties}>
                  {key}
                </kbd>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
