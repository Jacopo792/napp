import { Image as ImageIcon, Upload } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDismiss } from "@/components/useDismiss";
import { useStoredImage } from "@/lib/media";
import { clampCoverPosition, COVER_PRESETS, coverBackground } from "@/lib/pageProperties";
import type { NoteCover, NotePhoto } from "@/lib/types";

export interface PagePropertyValues {
  photo: NotePhoto;
  cover: NoteCover;
}

export function PageCover({
  cover,
  photo,
  canEdit,
  resolveImage,
  uploadImage,
  onChange,
  onError,
}: {
  cover: NoteCover;
  photo: NotePhoto;
  canEdit: boolean;
  resolveImage: (objectId: string) => Promise<Blob>;
  uploadImage: (file: File) => Promise<string>;
  onChange: (values: PagePropertyValues) => void;
  onError: (message: string) => void;
}) {
  const uploaded = useStoredImage(cover?.kind === "upload" ? cover.objectId : null, resolveImage);
  const [position, setPosition] = useState(cover?.position ?? 0.5);
  const [placing, setPlacing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickerRef = useDismiss(pickerOpen, () => setPickerOpen(false));

  useEffect(() => setPosition(cover?.position ?? 0.5), [cover]);
  if (!cover) return null;
  const activeCover = cover;
  const image = cover.kind === "preset" ? coverBackground(cover) : uploaded && `url("${uploaded}")`;

  function startReposition(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canEdit || activeCover.kind !== "upload") return;
    /* The controls sit on the picture, so a press on one is a press on the
       button and nothing else. Capturing the pointer here would retarget the
       click that follows to this surface — which is exactly how Change cover
       and Remove came to do nothing once a picture was set. */
    if ((event.target as HTMLElement).closest(".note-cover-actions")) return;
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!box) return;
    const startY = event.clientY;
    const initial = position;
    setPlacing(true);
    const move = (moved: PointerEvent) =>
      setPosition(clampCoverPosition(initial + (moved.clientY - startY) / box.height));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      setPlacing(false);
      setPosition((settled) => {
        if (settled !== activeCover.position)
          onChange({ photo, cover: { ...activeCover, position: settled } });
        return settled;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  async function upload(file: File | undefined) {
    if (!file || !canEdit) return;
    setBusy(true);
    try {
      const objectId = await uploadImage(file);
      onChange({ photo, cover: { kind: "upload", objectId, position: 0.5 } });
      onError("");
      setPickerOpen(false);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not use that picture");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openFilePicker() {
    const input = fileRef.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      /* Older browsers have no usable showPicker implementation, but still
         allow a file input to be activated from this same user gesture. */
      input.click();
    }
  }

  return (
    <div
      ref={surfaceRef}
      className={`note-page-cover ${placing ? "is-placing" : ""} ${pickerOpen ? "is-picker-open" : ""}`}
      /* Longhands, never the `background` shorthand: React writes only the
         properties that changed, so a shorthand applied after a new picture
         was chosen reset `background-position` to the top and the focal point
         set by dragging was lost. */
      style={{
        backgroundColor: "var(--paper-2)",
        backgroundImage: image || undefined,
        backgroundSize: "cover",
        backgroundPosition: `center ${position * 100}%`,
      }}
      onPointerDown={startReposition}
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      {canEdit && (
        <div
          className="note-cover-actions"
          /* Keep every cover control out of the draggable surface. This is
             stronger than recognizing individual descendants in the surface
             handler: nested SVGs and the file-picker trigger never start a
             reposition gesture before their own click can run. */
          onPointerDown={(event) => event.stopPropagation()}
        >
          {cover.kind === "upload" && <span>Drag to reposition</span>}
          <div ref={pickerRef} className="relative">
            <button
              type="button"
              className="note-property-action"
              onClick={() => setPickerOpen((open) => !open)}
            >
              Change cover
            </button>
            {pickerOpen && (
              <div className="popover note-cover-picker absolute top-full right-0 z-50 mt-2 p-2">
                <p className="menu-label">Gallery</p>
                <div className="note-cover-grid">
                  {COVER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      aria-label={preset.name}
                      aria-pressed={cover.kind === "preset" && cover.id === preset.id}
                      style={{ background: preset.background }}
                      onClick={() => {
                        onChange({
                          photo,
                          cover: { kind: "preset", id: preset.id, position: 0.5 },
                        });
                        setPickerOpen(false);
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="menu-row mt-1"
                  disabled={busy}
                  onClick={openFilePicker}
                >
                  <Upload size={16} />
                  {busy ? "Uploading…" : "Upload a picture"}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="note-property-action"
            onClick={() => onChange({ photo, cover: null })}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

/** The note's own picture, and the one control the page still offers itself.
 *  A photo is set from the note's context menu, where the note is named. */
export function PageIdentity({
  photo,
  cover,
  canEdit,
  resolveImage,
  onChange,
}: {
  photo: NotePhoto;
  cover: NoteCover;
  canEdit: boolean;
  resolveImage: (objectId: string) => Promise<Blob>;
  onChange: (values: PagePropertyValues) => void;
}) {
  const url = useStoredImage(photo?.objectId ?? null, resolveImage);

  if (!photo && (!canEdit || cover)) return null;

  return (
    <div className="note-page-identity">
      {photo && <span className="note-photo is-page">{url && <img src={url} alt="" />}</span>}
      {!cover && canEdit && (
        <button
          type="button"
          className="note-add-property"
          onClick={() =>
            onChange({
              photo,
              cover: { kind: "preset", id: COVER_PRESETS[0].id, position: 0.5 },
            })
          }
        >
          <ImageIcon size={15} />
          Add cover
        </button>
      )}
    </div>
  );
}
