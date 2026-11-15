import { X } from "@/components/icons";
import { emerge, leave } from "@/lib/motion";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export interface ImagePreview {
  src: string;
  alt: string;
}

/* The picture grows out of itself in the note rather than appearing over it.
   Already decoded when it was shown in the note, so it is usually complete at
   mount and can be measured at once; otherwise it waits for the bytes. */
const openOut = (img: HTMLImageElement | null) => {
  if (!img) return;
  if (img.complete) emerge(img, "zoom");
  else img.addEventListener("load", () => emerge(img, "zoom"), { once: true });
};

export function ImageLightbox({
  preview,
  onClose,
}: {
  preview: ImagePreview;
  onClose: () => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const close = () => leave(layer.current, onClose);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") leave(layer.current, onClose);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={preview.alt}
      className="lightbox"
      ref={layer}
      onClick={close}
    >
      <figure className="lightbox-figure" onClick={(event) => event.stopPropagation()}>
        <img src={preview.src} alt={preview.alt} ref={openOut} />
      </figure>
      <button
        type="button"
        onClick={close}
        className="round-close lightbox-close press"
        aria-label="Close image"
      >
        <X size={18} />
      </button>
    </div>,
    document.body,
  );
}
