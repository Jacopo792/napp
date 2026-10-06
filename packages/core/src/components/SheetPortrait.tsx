/* The picture at the top of a sheet, and the two things a hand does to it.
 *
 * Held, it comes up large — a 72px face is too small to see who it is. Pressed
 * once, it is changed, with the cropper every picture here is cut by. The two
 * are told apart by time, so a hold that lands never also opens the file
 * dialog. Where the picture is not the reader's to change, a press shows it.
 *
 * The cropper and the enlarged picture are portalled to the body: the sheet
 * carries a transform, and a `position: fixed` inside a transform is fixed to
 * the sheet, not the window. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AvatarCropper } from "@/components/AvatarCropper";
import type { AvatarCrop } from "@/lib/image";

const HOLD_MS = 450;

export function SheetPortrait({
  className,
  image,
  label,
  onPick,
  children,
}: {
  className: string;
  /** What comes up when it is held; nothing to enlarge without one. */
  image: string | null;
  label: string;
  /** Absent where the picture is not the reader's to change. */
  onPick?: (file: File, crop: AvatarCrop) => void;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef(0);
  const held = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setZoomed(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [zoomed]);

  const release = () => window.clearTimeout(timer.current);
  const press = () => {
    if (onPick) input.current?.click();
    else if (image) setZoomed(true);
  };
  const interactive = Boolean(onPick || image);

  return (
    <>
      <span
        className={`${className} ${interactive ? "is-pressable" : ""}`}
        data-sheet-flyer
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={interactive ? label : undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          held.current = false;
          release();
          if (image)
            timer.current = window.setTimeout(() => {
              held.current = true;
              setZoomed(true);
            }, HOLD_MS);
        }}
        onPointerUp={release}
        onPointerLeave={release}
        onPointerCancel={release}
        /* A finger's long press is also the system's context menu. */
        onContextMenu={(event) => image && event.preventDefault()}
        onClick={() => {
          if (held.current) held.current = false;
          else press();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          press();
        }}
      >
        {children}
      </span>
      {onPick && (
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) setCropping(file);
            event.target.value = "";
          }}
        />
      )}
      {cropping &&
        onPick &&
        createPortal(
          <AvatarCropper
            file={cropping}
            busy={false}
            onCancel={() => setCropping(null)}
            onConfirm={(crop) => {
              onPick(cropping, crop);
              setCropping(null);
            }}
          />,
          document.body,
        )}
      {zoomed &&
        image &&
        createPortal(
          <div
            className={`portrait-zoom ${className.includes("is-round") ? "is-round" : ""}`}
            role="dialog"
            aria-label={label}
            onClick={() => setZoomed(false)}
          >
            <img src={image} alt="" draggable={false} />
          </div>,
          document.body,
        )}
    </>
  );
}
