import { Check, Pencil, Trash2, Undo2 } from "@/components/icons";
import {
  drawingMarks,
  drawingSurface,
  isDrawingText,
  type DrawingMark,
  type DrawingStroke,
} from "@/features/editor/lib/content";
import { splitMediaStroke } from "@/features/editor/lib/mediaInk";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TAKE_UP_THE_PEN, consumeDrawing } from "./drawingRequests";
import { DrawingStage } from "./DrawingStage";
import { PenTray } from "./PenTray";
import { useStage } from "./useDrawingStage";
import { useInk } from "./useInk";

export function DrawingView({
  node,
  updateAttributes,
  deleteNode,
  editor,
  extension,
  getPos,
}: NodeViewProps) {
  const strokes = useMemo(() => drawingMarks(node.attrs.strokes as string), [node.attrs.strokes]);
  const onPage = drawingSurface(node.attrs.surface) === "page";
  /* The pen is in hand only if this layer is the one that was just asked for.
     Coming back to a note is coming back to read or to write it; drawing on it
     again is a thing you ask for, from the ⋯ palette or from the pen in the
     corner. A board has no pen state at all: it is a sheet, and there is
     nothing on it to protect from the pointer. */
  const [pen, setPen] = useState(() => {
    if (!onPage || !consumeDrawing("page")) return false;
    return true;
  });
  useEffect(() => {
    if (!onPage) return;
    const take = () => setPen(true);
    editor.view.dom.addEventListener(TAKE_UP_THE_PEN, take);
    return () => editor.view.dom.removeEventListener(TAKE_UP_THE_PEN, take);
  }, [onPage, editor]);

  const write = useCallback(
    (next: DrawingMark[]) => {
      const arrived = next[next.length - 1];
      /* Only a stroke can cross into a picture. A caption belongs to the
         surface it was written on: words that slid into a photograph when it
         happened to be under them is not a thing anybody asked for. */
      if (!onPage || next.length !== strokes.length + 1 || !arrived || isDrawingText(arrived)) {
        updateAttributes({ strokes: JSON.stringify(next) });
        return;
      }
      const page = editor.view.dom.getBoundingClientRect();
      const frames = Array.from(
        editor.view.dom.querySelectorAll<HTMLElement>(".rich-media-image-frame"),
      )
        .map((element) => {
          const wrapper = element.closest("[data-node-view-wrapper]")!;
          const pos = editor.view.posAtDOM(wrapper, 0);
          return { rect: element.getBoundingClientRect(), pos, node: editor.state.doc.nodeAt(pos) };
        })
        .filter(
          (frame) => frame.node && ["privateImage", "privateFile"].includes(frame.node.type.name),
        );
      const stroke: DrawingStroke = arrived;
      const sections = splitMediaStroke(
        stroke,
        page,
        frames.map((frame) => frame.rect),
      );
      const tr = editor.state.tr;
      for (let index = 0; index < frames.length; index++) {
        const added = sections
          .filter((section) => section.target === index)
          .map((section) => section.stroke);
        if (!added.length) continue;
        const frame = frames[index];
        tr.setNodeMarkup(frame.pos, undefined, {
          ...frame.node!.attrs,
          strokes: JSON.stringify([...drawingMarks(frame.node!.attrs.strokes), ...added]),
        });
      }
      if (tr.docChanged) editor.view.dispatch(tr);
      updateAttributes({
        strokes: JSON.stringify([
          ...strokes,
          ...sections.filter((section) => section.target === -1).map((section) => section.stroke),
        ]),
      });
    },
    [updateAttributes, onPage, strokes, editor],
  );
  const { surface, box, start, inked, hand, erasing, arranging, menu } = useInk({
    strokes,
    write,
    fit: onPage ? "width" : "board",
    /* A board is drawn on its stage; in the note it is only shown. */
    editable: editor.isEditable && onPage,
  });
  const sheet = useRef<HTMLButtonElement>(null);
  const stage = useStage(
    editor,
    () => {
      const noteId = (extension.options as { noteId: () => string | undefined }).noteId();
      const at = typeof getPos === "function" ? getPos() : undefined;
      if (!noteId || onPage || at === undefined) return null;
      /* A board is named by its place among the note's boards: it has no id
         of its own, and the two screens hold the same document. */
      let board = 0;
      editor.state.doc.descendants((each, pos) => {
        if (pos >= at) return false;
        if (each.type.name === node.type.name && drawingSurface(each.attrs.surface) !== "page")
          board++;
      });
      return { noteId, board };
    },
    () => sheet.current?.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  const openStage = stage.open;
  useEffect(() => {
    if (onPage || !consumeDrawing("board")) return;
    openStage("own");
    // Once, for the board that was just asked for.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const remove = (
    <button
      type="button"
      className="rich-media-file-action is-danger"
      aria-label={onPage ? "Remove the drawing layer" : "Remove drawing"}
      title={onPage ? "Remove the drawing layer" : "Remove drawing"}
      onClick={deleteNode}
    >
      <Trash2 size={16} />
    </button>
  );

  if (onPage) {
    return (
      <NodeViewWrapper className="drawing-overlay" contentEditable={false}>
        {menu}
        <svg
          ref={surface}
          className={`drawing-overlay-surface ${
            pen && !erasing && !arranging ? "is-drawing" : ""
          } ${pen && erasing ? "is-erasing" : ""} ${pen && arranging ? "is-arranging" : ""}`}
          viewBox={`0 0 ${box.width} ${box.height}`}
          /* **`meet`, never `none`.** A page measures both axes against its
             width — that is the whole of the stored model — and `none` throws
             that away: it stretches the viewBox to whatever height the element
             happens to have, so the ink is only in the right place while the
             measured height is exactly right.
             It is not. The height is read by a `ResizeObserver` and the note
             it lies over grows every time somebody presses Return, so there is
             always a moment where a taller column is being filled by a shorter
             viewBox — and in that moment every stroke slides down the page and
             stretches, which is how ink drawn beside a paragraph ends up lying
             across it.
             `meet` scales by the smaller of the two ratios. When the measured
             height lags behind — which is the direction it always lags, since
             notes grow downwards — that is the width, which is the axis the
             strokes were stored against in the first place. The ink stays
             where it was put and keeps its shape, and the observer's answer
             only decides how far down the surface takes a pen. */
          preserveAspectRatio="xMinYMin meet"
          onPointerDown={start}
        >
          {inked}
        </svg>
        {editor.isEditable && (
          <span className={`drawing-overlay-tools ${pen ? "" : "is-put-away"}`}>
            {pen ? (
              <PenTray hand={hand}>
                <span className="pen-tray-rule" />
                <button
                  type="button"
                  className="pen-tray-tool"
                  aria-label="Undo the last stroke"
                  title="Undo the last stroke"
                  disabled={strokes.length === 0}
                  onClick={() => write(strokes.slice(0, -1))}
                >
                  <Undo2 size={18} />
                </button>
                <button
                  type="button"
                  className="pen-tray-tool"
                  aria-label="Remove the drawing layer"
                  title="Remove the drawing layer"
                  onClick={deleteNode}
                >
                  <Trash2 size={18} />
                </button>
                <button
                  type="button"
                  className="pen-tray-tool is-done"
                  aria-label="Put the pen down"
                  title="Put the pen down"
                  onClick={() => setPen(false)}
                >
                  <Check size={18} />
                </button>
              </PenTray>
            ) : (
              <button
                type="button"
                className="rich-media-file-action"
                aria-label="Draw on the page"
                title="Draw on the page"
                onClick={() => setPen(true)}
              >
                <Pencil size={16} />
              </button>
            )}
          </span>
        )}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className="rich-media-drawing">
      <button
        ref={sheet}
        type="button"
        className="rich-media-drawing-sheet"
        contentEditable={false}
        aria-label="Draw"
        disabled={!editor.isEditable}
        onClick={() => stage.open("own")}
      >
        <svg
          ref={surface}
          className="rich-media-drawing-surface"
          viewBox={`0 0 ${box.width} ${box.height}`}
          preserveAspectRatio="none"
        >
          {inked}
        </svg>
      </button>
      {editor.isEditable && (
        <span className="rich-media-drawing-tools" contentEditable={false}>
          <button
            type="button"
            className="rich-media-file-action"
            aria-label="Draw"
            title="Draw"
            onClick={() => stage.open("own")}
          >
            <Pencil size={16} />
          </button>
          {remove}
        </span>
      )}
      {stage.mode && sheet.current && (
        <DrawingStage
          subject={{ kind: "board" }}
          initial={strokes}
          live={strokes}
          anchor={sheet.current}
          phone={stage.phone}
          until={stage.until}
          onDraft={
            stage.mode === "lent"
              ? (next) => updateAttributes({ strokes: JSON.stringify(next) })
              : undefined
          }
          onKeep={(next) => updateAttributes({ strokes: JSON.stringify(next.strokes) })}
          onClose={stage.close}
        />
      )}
    </NodeViewWrapper>
  );
}
