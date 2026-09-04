import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Loader2, Move, ZoomIn } from "lucide-react";
import { avatarCropRect, avatarDragBound, type AvatarCrop } from "@/lib/image";

/* Where the square sits was the file's business until now: the picture was cut
   from the middle, which is right for a portrait and wrong for everything
   else. This is the smallest thing that hands that decision back — the same
   round window the avatar is drawn in, the picture moved behind it, and one
   slider. What the window shows is exactly what `avatarCropRect` cuts, because
   both are given the same three numbers. */

/* The stage is the whole picture you can see; the circle inside it is the crop.
   `VIEWPORT` is the circle, because the circle is what is cut — the inset used
   to live only in the stylesheet, so the square being cut was the stage and
   every picture came back a tenth wider than the one that had been framed. The
   inset is handed to CSS below from this constant, so the two cannot drift
   apart again. */
const STAGE = 260;
const WINDOW_INSET = 10;
const VIEWPORT = STAGE - WINDOW_INSET * 2;
const MAX_ZOOM = 3;

export function AvatarCropper({
  file,
  busy,
  onCancel,
  onConfirm,
}: {
  file: File;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (crop: AvatarCrop) => void;
}) {
  const [url, setUrl] = useState("");
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ pointerId: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    setSize(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  /** Keeps the picture covering the window, whatever the drag or the slider
   *  asked for. Clamping here rather than at the end means the image never
   *  leaves a corner empty for a frame. */
  function clamp(next: { x: number; y: number }, atZoom: number) {
    if (!size) return { x: 0, y: 0 };
    const shortSide = Math.min(size.width, size.height);
    const boundX = avatarDragBound({
      imageSide: size.width,
      imageShortSide: shortSide,
      viewport: VIEWPORT,
      zoom: atZoom,
    });
    const boundY = avatarDragBound({
      imageSide: size.height,
      imageShortSide: shortSide,
      viewport: VIEWPORT,
      zoom: atZoom,
    });
    return {
      x: Math.min(Math.max(next.x, -boundX), boundX),
      y: Math.min(Math.max(next.y, -boundY), boundY),
    };
  }

  function changeZoom(next: number) {
    setZoom(next);
    setOffset((current) => clamp(current, next));
  }

  const scale = size ? (VIEWPORT / Math.min(size.width, size.height)) * zoom : 1;

  function confirm() {
    if (!size) return;
    onConfirm(
      avatarCropRect({
        imageWidth: size.width,
        imageHeight: size.height,
        viewport: VIEWPORT,
        zoom,
        offsetX: offset.x,
        offsetY: offset.y,
      }),
    );
  }

  return (
    <div className="settings-layer cropper-layer" role="presentation">
      <button type="button" aria-label="Cancel" className="settings-scrim" onClick={onCancel} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="cropper-title"
        className="cropper-panel glass-sheet"
      >
        <h2 id="cropper-title">Place your picture</h2>
        <p>Drag the picture behind the circle, and use the slider to come closer.</p>

        <div
          className="cropper-stage"
          style={
            {
              width: STAGE,
              height: STAGE,
              "--cropper-inset": `${WINDOW_INSET}px`,
            } as CSSProperties
          }
          onPointerDown={(event) => {
            if (!size) return;
            drag.current = {
              pointerId: event.pointerId,
              startX: event.clientX - offset.x,
              startY: event.clientY - offset.y,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const active = drag.current;
            if (!active || active.pointerId !== event.pointerId) return;
            setOffset(
              clamp({ x: event.clientX - active.startX, y: event.clientY - active.startY }, zoom),
            );
          }}
          onPointerUp={(event) => {
            drag.current = null;
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
        >
          {url && (
            <img
              src={url}
              alt=""
              draggable={false}
              onLoad={(event) =>
                setSize({
                  width: event.currentTarget.naturalWidth,
                  height: event.currentTarget.naturalHeight,
                })
              }
              style={
                size
                  ? {
                      width: size.width * scale,
                      height: size.height * scale,
                      /* The half-translate is the centring, in the same
                         property as the drag: two transforms on one element,
                         not a transform fighting a layout. */
                      transform: `translate(-50%, -50%) translate3d(${offset.x}px, ${offset.y}px, 0)`,
                    }
                  : { opacity: 0 }
              }
            />
          )}
          <span className="cropper-window" aria-hidden="true" />
          <span className="cropper-grip" aria-hidden="true">
            <Move size={16} />
          </span>
        </div>

        <label className="cropper-zoom" aria-label="Zoom">
          <ZoomIn size={16} aria-hidden="true" />
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={zoom}
            disabled={!size}
            onChange={(event) => changeZoom(Number(event.target.value))}
          />
        </label>

        <div className="cropper-actions">
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="is-primary" onClick={confirm} disabled={busy || !size}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {busy ? "Saving…" : "Use this picture"}
          </button>
        </div>
      </section>
    </div>
  );
}
