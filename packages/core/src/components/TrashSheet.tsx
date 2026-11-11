/* A book's Trash: what was thrown away, each with the way back and the way
 * out. A sheet rather than a menu, because a menu of titles with a submenu
 * each showed the act and hid the list — and the list is what somebody opens
 * the Trash to read. The rows sit in one card and the way back is "Restore",
 * the word and glyph the notes' Recently Deleted uses. Deleting for good takes
 * the second press, as it does everywhere else. */
import { useState } from "react";
import { RotateCcw, Trash2 } from "@/components/icons";
import { Sheet } from "@/components/Sheet";

export function TrashSheet({
  items,
  canWrite,
  onRestore,
  onDelete,
}: {
  items: { id: string; title: string }[];
  canWrite: boolean;
  onRestore: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <Sheet label="Trash">
      <div className="sheet-body">
        <header className="sheet-hero">
          <span className="sheet-portrait sheet-note-glyph">
            <Trash2 size={30} />
          </span>
          <h2>Trash</h2>
          <p>{items.length === 1 ? "1 page" : `${items.length} pages`}</p>
        </header>
        <div className="sheet-work">
          {items.length === 0 && <p className="sheet-quiet">The Trash is empty</p>}
          {items.length > 0 && (
            <section className="sheet-card">
              {items.map((item) => (
                <div key={item.id} className="sheet-row trash-row">
                  <span className="sheet-row-title">{item.title || "Untitled"}</span>
                  {canWrite && (
                    <span className="trash-row-acts">
                      <button
                        type="button"
                        className="space-list-button press"
                        onClick={() => onRestore(item.id)}
                      >
                        <RotateCcw size={14} />
                        Restore
                      </button>
                      <button
                        type="button"
                        className={`space-list-button is-danger press ${
                          confirming === item.id ? "is-confirm" : ""
                        }`}
                        aria-label="Delete forever"
                        onBlur={() => setConfirming(null)}
                        onClick={() => {
                          if (confirming !== item.id) return setConfirming(item.id);
                          setConfirming(null);
                          onDelete(item.id);
                        }}
                      >
                        {confirming === item.id ? "Delete forever" : <Trash2 size={14} />}
                      </button>
                    </span>
                  )}
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </Sheet>
  );
}
