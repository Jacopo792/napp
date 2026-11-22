import { Download, ExternalLink, Pencil, Trash2 } from "@/components/icons";
import { attachmentExtension, attachmentType } from "@/features/editor/lib/attachments";
import { drawingMarks } from "@/features/editor/lib/content";
import { isWholeView, readView, writeCrop } from "@/features/editor/lib/mediaInk";
import { platform } from "@/platform";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { planeCss } from "./drawingGeometry";
import { DrawingStage } from "./DrawingStage";
import { useStage } from "./useDrawingStage";
import { useInk } from "./useInk";

export type Resolver = (objectId: string) => Promise<Blob>;

export interface PrivateImageOptions {
  resolve: Resolver;
  /** The note this is in, for lending a picture to the phone. A video's
   *  view has none: a video is not drawn on. */
  noteId?: () => string | undefined;
  open: (src: string, alt: string) => void;
}

export interface PrivateFileOptions {
  resolve: Resolver;
}

export function PrivateImageView({
  node,
  extension,
  updateAttributes,
  deleteNode,
  editor,
}: NodeViewProps) {
  const { objectId } = node.attrs as { objectId: string };
  const alt = String(node.attrs.alt ?? node.attrs.label ?? "Image");
  const video = node.type.name === "privateFile";
  const options = extension.options as PrivateImageOptions;
  const resolveImage = options.resolve;
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");
  /* A picture is fetched once, and one failed fetch used to be forever: a
     token that expired mid-session, or a peer whose upload had not landed in
     Storage yet, left a permanent "could not be displayed" in a note whose
     picture was perfectly fine. Bumping this re-runs the effect. */
  const [attempt, setAttempt] = useState(0);

  /* Ink over the picture. A photograph of a page of notes is the thing people
     most want to write on, and the layer is the same one the note itself
     takes — same hand, same box, measured against the picture's width. It is
     put down until it is picked up, so the picture still opens when clicked. */
  const strokes = useMemo(() => drawingMarks(node.attrs.strokes as string), [node.attrs.strokes]);
  /* The picture's own size, learned when it decodes: a crop and a turn are
     laid out against it. */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const view = useMemo(
    () => readView(node.attrs.crop, node.attrs.turns),
    [node.attrs.crop, node.attrs.turns],
  );
  const shaped = !isWholeView(view) && natural !== null && !video;
  const plane = shaped ? planeCss(view, natural, view.turns) : null;
  /* Marking up happens on a stage of its own, on a draft of the strokes: the
     note's document is written once, on Done, and not at all on Cancel. */
  const frame = useRef<HTMLSpanElement>(null);
  const stage = useStage(
    editor,
    () => {
      const noteId = options.noteId?.();
      return noteId && !video ? { noteId, objectId } : null;
    },
    () =>
      (frame.current?.querySelector(".rich-media-image-open") ?? frame.current)?.scrollIntoView({
        block: "center",
        behavior: "instant",
      }),
  );
  const ink = useInk({
    strokes,
    write: () => {},
    fit: "width",
    editable: false,
    turned: shaped,
  });

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setSrc("");
    setError("");
    void resolveImage(objectId)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(
          video ? new Blob([blob], { type: attachmentType(alt) }) : blob,
        );
        setSrc(objectUrl);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : video
                ? "This video could not be displayed"
                : "This image could not be displayed",
          );
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectId, resolveImage, attempt, video, alt]);

  /* Fades in once decoded rather than painting in as it arrives. */
  const pic = (
    <img
      src={src}
      alt={alt || "Image"}
      draggable={false}
      onLoad={(event) => {
        event.currentTarget.classList.add("is-arrived");
        setNatural({ w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight });
      }}
    />
  );
  /* Always mounted, even with nothing on it: the layer measures itself to
     know how tall it is in stroke units, and a layer that appears only once
     the pen is out has nothing to measure until too late. */
  const layer = (
    <svg
      ref={ink.surface}
      className="rich-media-image-ink"
      viewBox={`0 0 ${ink.box.width} ${ink.box.height}`}
      /* See the page layer below: a surface measured against its width must
         never let its height stretch the ink. */
      preserveAspectRatio="xMinYMin meet"
    >
      {ink.inked}
    </svg>
  );

  return (
    <NodeViewWrapper className={`rich-media-image ${error ? "is-error" : ""}`}>
      {/* The frame is what the ink lies over, and it holds the picture alone:
          an overlay on the wrapper would reach down over the caption, and the
          caption is not part of the picture. There is no caption under it
          any more: the alt was a file name or an object id, and a pasted
          picture arrived with a uuid printed beneath it. */}
      <span ref={frame} className="rich-media-image-frame" contentEditable={false}>
        {src && video ? (
          <video
            src={src}
            controls
            preload="metadata"
            onError={() => setError("This video could not be played")}
          />
        ) : src ? (
          <button
            type="button"
            className="rich-media-image-open"
            /* A cropped or turned picture is a box of its own proportions,
               as wide as an uncropped picture of that shape would be. */
            style={plane ? { width: `min(100%, ${34 * plane.aspect}rem)` } : undefined}
            onClick={() => options.open(src, alt || "Image")}
          >
            {plane ? (
              <div
                className="rich-media-image-view"
                data-crop={node.attrs.crop}
                data-turns={view.turns}
                data-strokes={node.attrs.strokes}
                style={{ aspectRatio: plane.aspect }}
              >
                <div className="media-plane" style={plane.style}>
                  {pic}
                  {layer}
                </div>
              </div>
            ) : (
              pic
            )}
          </button>
        ) : (
          <span
            className={error ? "rich-media-loading" : "rich-media-loading skeleton"}
            role="status"
            aria-label={error ? undefined : video ? "Loading video" : "Loading image"}
          >
            {error}
            {error && (
              <button
                type="button"
                className="rich-media-retry"
                onClick={() => setAttempt((count) => count + 1)}
              >
                Try again
              </button>
            )}
          </span>
        )}
        {!plane && layer}
      </span>
      {editor.isEditable && src && !video && (
        <button
          type="button"
          className="rich-media-remove is-ink"
          aria-label="Mark up this picture"
          title="Mark up this picture"
          onClick={() => stage.open("own")}
          contentEditable={false}
        >
          <Pencil size={16} />
        </button>
      )}
      {editor.isEditable && (
        <button
          type="button"
          className="rich-media-remove"
          aria-label={video ? "Remove video" : "Remove image"}
          title={video ? "Remove video" : "Remove image"}
          onClick={deleteNode}
          contentEditable={false}
        >
          <Trash2 size={16} />
        </button>
      )}
      {stage.mode && frame.current && natural && src && (
        <DrawingStage
          subject={{ kind: "image", src, alt, view, natural }}
          initial={strokes}
          live={strokes}
          anchor={
            frame.current.querySelector<HTMLElement>(".rich-media-image-open") ?? frame.current
          }
          phone={stage.phone}
          until={stage.until}
          onDraft={
            stage.mode === "lent"
              ? (next) => updateAttributes({ strokes: JSON.stringify(next) })
              : undefined
          }
          onKeep={(next) =>
            updateAttributes({
              strokes: JSON.stringify(next.strokes),
              ...(next.view ? { crop: writeCrop(next.view.crop), turns: next.view.turns } : {}),
            })
          }
          onClose={stage.close}
        />
      )}
    </NodeViewWrapper>
  );
}

export function PrivateFileView(props: NodeViewProps) {
  if (attachmentType(String(props.node.attrs.label)).startsWith("video/"))
    return <PrivateImageView {...props} />;
  return <PrivateAttachmentView {...props} />;
}

function PrivateAttachmentView({ node, extension, deleteNode, editor }: NodeViewProps) {
  const { objectId, label } = node.attrs as { objectId: string; label: string };
  const options = extension.options as PrivateFileOptions;
  const [status, setStatus] = useState("Private attachment · opens in a new tab");
  const [error, setError] = useState(false);

  function resolve() {
    setError(false);
    return options.resolve(objectId).catch((reason: unknown) => {
      setError(true);
      setStatus(reason instanceof Error ? reason.message : "This attachment could not be opened");
      throw reason;
    });
  }

  function open() {
    setStatus("Opening…");
    /* `resolve` is passed rather than awaited: a browser has to claim the new
       tab inside this click, and only the shell knows whether it needs to. */
    void platform()
      .openFile(label, resolve)
      .then((hint) => setStatus(hint ?? "Private attachment · opens in a new tab"))
      .catch(() => undefined);
  }

  function download() {
    setStatus("Preparing download…");
    void resolve()
      .then((blob) => platform().saveFile(label, blob))
      .then(() => setStatus("Private attachment · opens in a new tab"))
      .catch(() => undefined);
  }

  return (
    <NodeViewWrapper className={`rich-media-file ${error ? "is-error" : ""}`}>
      <button type="button" className="rich-media-file-open" onClick={open} contentEditable={false}>
        <span className="rich-media-file-badge">{attachmentExtension(label)}</span>
        <span className="rich-media-file-text">
          <span className="rich-media-file-name">{label}</span>
          <span className="rich-media-file-hint">{status}</span>
        </span>
        <ExternalLink size={16} />
      </button>
      {editor.isEditable && (
        <span className="rich-media-file-actions" contentEditable={false}>
          <button
            type="button"
            className="rich-media-file-action"
            onClick={download}
            aria-label={`Download ${label}`}
          >
            <Download size={16} />
          </button>
          <button
            type="button"
            className="rich-media-file-action is-danger"
            onClick={deleteNode}
            aria-label={`Remove ${label}`}
          >
            <Trash2 size={16} />
          </button>
        </span>
      )}
    </NodeViewWrapper>
  );
}
