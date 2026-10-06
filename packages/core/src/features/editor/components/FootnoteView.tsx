/* A footnote in the text: the number, which the sheet's counter draws, and
 * the popover its words are written in. Word sends the caret to the foot of
 * the page to write a note; on a sheet that is one long column the foot can
 * be a long way off, so the note is written beside its number instead, and
 * read at the foot of the chapter.
 *
 * The words are written to the document when the popover closes, not per
 * keystroke: an attribute is replaced whole, and a whole note rewritten on
 * every letter is a version history of single letters. Nothing typed is
 * lost by closing — Esc keeps it, as every way out does. */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Trash2 } from "@/components/icons";
import { OPEN_FOOTNOTE, takeFootnoteWanted } from "@/features/editor/lib/referenceMarks";

export function FootnoteView({
  node,
  editor,
  getPos,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps) {
  const text = typeof node.attrs.text === "string" ? node.attrs.text : "";
  const anchor = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /* Fresh: made a moment ago and not yet written in. Closed empty, it goes,
     because a number with nothing under it is a mistake, not a note. */
  const [open, setOpen] = useState(() => takeFootnoteWanted(getPos()));
  const fresh = useRef(open);
  const [draft, setDraft] = useState(text);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  const editable = editor.isEditable;
  const field = useRef<HTMLTextAreaElement>(null);

  /* Into the words as the panel opens — a frame late on purpose, after any
     focus the editor itself had queued for the keystroke that opened it. */
  useEffect(() => {
    if (!open || !editable) return;
    const timer = window.setTimeout(() => {
      const box = field.current;
      if (!box) return;
      box.focus();
      box.setSelectionRange(box.value.length, box.value.length);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [open, editable]);

  useEffect(() => {
    if (!open) setDraft(text);
  }, [open, text]);

  useEffect(() => {
    const ask = (event: Event) => {
      if ((event as CustomEvent<number>).detail === getPos()) setOpen(true);
    };
    window.addEventListener(OPEN_FOOTNOTE, ask);
    return () => window.removeEventListener(OPEN_FOOTNOTE, ask);
  }, [getPos]);

  const close = useCallback(
    (write: boolean) => {
      setOpen(false);
      if (!editable || !write) return;
      const words = draft.replace(/\s+$/, "");
      if (fresh.current && !words) deleteNode();
      else if (words !== text) updateAttributes({ text: words || null });
      fresh.current = false;
      editor.commands.focus();
    },
    [deleteNode, draft, editable, editor, text, updateAttributes],
  );

  /* Under the number, kept on the screen. Measured again as the column
     scrolls, so the panel stays with the number it belongs to. */
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const box = anchor.current?.getBoundingClientRect();
      if (!box) return;
      const width = Math.min(340, window.innerWidth - 24);
      setPlace({
        left: Math.max(12, Math.min(box.left - 24, window.innerWidth - width - 12)),
        top: box.bottom + 6,
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.current?.contains(target)) close(true);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, close]);

  return (
    <NodeViewWrapper
      as="sup"
      ref={anchor}
      className={`footnote-ref ${selected ? "is-selected" : ""} ${text ? "" : "is-empty"}`}
      data-footnote=""
      title={open ? undefined : text || undefined}
      contentEditable={false}
      onMouseDown={(event: React.MouseEvent) => {
        event.preventDefault();
        setOpen(true);
      }}
    >
      {open &&
        place &&
        createPortal(
          <div
            ref={panel}
            className="popover footnote-panel"
            role="dialog"
            aria-label="Footnote"
            style={{ left: place.left, top: place.top }}
          >
            {editable ? (
              <textarea
                ref={field}
                rows={3}
                value={draft}
                placeholder="Footnote"
                aria-label="Footnote"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
                    event.preventDefault();
                    close(true);
                  }
                }}
              />
            ) : (
              <p className="footnote-panel-text">{text || "Empty footnote"}</p>
            )}
            {editable && (
              <div className="footnote-panel-actions">
                <button
                  type="button"
                  className="ribbon-tool press"
                  aria-label="Delete footnote"
                  title="Delete footnote"
                  onClick={() => {
                    setOpen(false);
                    deleteNode();
                    editor.commands.focus();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </NodeViewWrapper>
  );
}
