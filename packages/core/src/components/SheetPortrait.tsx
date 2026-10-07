/* A picture somebody owns — a face, a note's photo — and what a hand does to it.
 *
 * Held, it comes up large — a 40px photo is too small to see what it is.
 * Pressed once, it offers itself: View, Edit (the cropper again, over the
 * picture already there), Change, Remove. It used to go straight to the file
 * dialog, so the only edit there was was choosing a different picture. The two
 * are told apart by time, so a hold that lands never also opens the menu.
 * Where the picture is not the reader's to change, a press shows it.
 *
 * Used on a sheet and on the page, so nothing in it is sheet-only:
 * `data-sheet-flyer` is read only inside a sheet.
 *
 * The cropper and the enlarged picture are portalled to the body: the sheet
 * carries a transform, and a `position: fixed` inside a transform is fixed to
 * the sheet, not the window. The menu is the page's own, never the system's:
 * Change opens a file dialog, which a browser grants to a click and not to a
 * message coming back over an IPC bridge. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AvatarCropper } from "@/components/AvatarCropper";
import { ContextMenu } from "@/components/ContextMenu";
import { MenuItems } from "@/components/MenuPrimitives";
import { Camera, Crop, ImageOff, Maximize2 } from "@/components/icons";
import type { MenuPoint } from "@/lib/contextMenu";
import type { AvatarCrop } from "@/lib/image";
import type { MenuItem } from "@/lib/menuShape";

export const HOLD_MS = 450;

export function SheetPortrait({
  className,
  image,
  label,
  onPick,
  onRemove,
  flyer = true,
  children,
}: {
  className: string;
  /** What comes up when it is held; nothing to enlarge without one. */
  image: string | null;
  label: string;
  /** Absent where the picture is not the reader's to change. */
  onPick?: (file: File, crop: AvatarCrop) => void;
  onRemove?: () => void;
  /** Whether this is the face a sheet flies out of. */
  flyer?: boolean;
  children: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef(0);
  const held = useRef(false);
  const [zoomed, setZoomed] = useState(false);
  const [cropping, setCropping] = useState<File | null>(null);
  const [menu, setMenu] = useState<MenuPoint | null>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const release = () => window.clearTimeout(timer.current);
  const press = (at: MenuPoint) => {
    if (onPick && image) setMenu(at);
    else if (onPick) input.current?.click();
    else if (image) setZoomed(true);
  };
  const interactive = Boolean(onPick || image);

  /* Edit is the cropper over the stored picture, which is already cut: it can
     be framed tighter, not wider. ponytail: keeping the original upload beside
     the cut would let Edit zoom back out; add it when somebody asks. */
  async function edit() {
    if (!image) return;
    const blob = await fetch(image).then((response) => response.blob());
    setCropping(new File([blob], "picture", { type: blob.type || "image/png" }));
  }

  const items: MenuItem[] = [
    {
      kind: "item",
      id: "view",
      label: "View",
      icon: <Maximize2 size={16} />,
      run: () => setZoomed(true),
    },
    { kind: "item", id: "edit", label: "Edit", icon: <Crop size={16} />, run: () => void edit() },
    {
      kind: "item",
      id: "change",
      label: "Change…",
      icon: <Camera size={16} />,
      run: () => input.current?.click(),
    },
    ...(onRemove
      ? [
          { kind: "separator" as const },
          {
            kind: "item" as const,
            id: "remove",
            label: "Remove",
            icon: <ImageOff size={16} />,
            danger: true,
            run: onRemove,
          },
        ]
      : []),
  ];

  return (
    <>
      <span
        className={`${className} ${interactive ? "is-pressable" : ""}`}
        data-sheet-flyer={flyer || undefined}
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
        onClick={(event) => {
          if (held.current) held.current = false;
          else press({ x: event.clientX, y: event.clientY });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          const box = event.currentTarget.getBoundingClientRect();
          press({ x: box.left, y: box.bottom + 4 });
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
      {menu && (
        <ContextMenu point={menu} onClose={() => setMenu(null)} width="12rem">
          <MenuItems items={items} close={() => setMenu(null)} />
        </ContextMenu>
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
      {zoomed && image && (
        <ImageZoom
          image={image}
          label={label}
          round={className.includes("is-round")}
          onClose={() => setZoomed(false)}
        />
      )}
    </>
  );
}

/** A picture brought up over the whole window; any press puts it back. */
export function ImageZoom({
  image,
  label,
  round = false,
  wide = false,
  onClose,
}: {
  image: string;
  label: string;
  round?: boolean;
  /** Its own shape rather than a square: a cover is a landscape. */
  wide?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className={`portrait-zoom ${round ? "is-round" : ""} ${wide ? "is-wide" : ""}`}
      role="dialog"
      aria-label={label}
      onClick={onClose}
    >
      <img src={image} alt="" draggable={false} />
    </div>,
    document.body,
  );
}
