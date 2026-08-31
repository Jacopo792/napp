import {
  BookOpen,
  Bookmark,
  Check,
  Flag,
  Heart,
  Home,
  Image as ImageIcon,
  Lightbulb,
  Smile,
  Star,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useDismiss } from "@/components/useDismiss";
import { clampCoverPosition, COVER_PRESETS, coverBackground } from "@/lib/pageProperties";
import { PAGE_SYMBOLS, type NoteCover, type PageIcon, type PageSymbol } from "@/lib/types";

const EMOJI = [
  "📝",
  "📚",
  "✅",
  "💡",
  "🎯",
  "⭐",
  "🏠",
  "❤️",
  "🔖",
  "🚩",
  "📌",
  "🗓️",
  "☀️",
  "🌙",
  "🔥",
  "🌱",
  "🧭",
  "🧩",
  "🎧",
  "🍵",
  "✈️",
  "🏔️",
  "💬",
  "📎",
];

const SYMBOLS = {
  book: BookOpen,
  bookmark: Bookmark,
  bulb: Lightbulb,
  check: Check,
  flag: Flag,
  heart: Heart,
  home: Home,
  star: Star,
  target: Target,
} satisfies Record<PageSymbol, typeof BookOpen>;

export interface PagePropertyValues {
  pageIcon: PageIcon;
  cover: NoteCover;
}

export function PageIconGlyph({ icon }: { icon: PageIcon }) {
  if (!icon) return null;
  if (icon.kind === "emoji") return <>{icon.value}</>;
  const Glyph = SYMBOLS[icon.value];
  return <Glyph aria-hidden="true" />;
}

function useCoverUrl(cover: NoteCover, resolveImage: (objectId: string) => Promise<Blob>) {
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const objectId = cover?.kind === "upload" ? cover.objectId : null;

  useEffect(() => {
    if (!objectId) {
      setUploadedUrl(null);
      return;
    }
    let live = true;
    let url = "";
    void resolveImage(objectId)
      .then((blob) => {
        if (!live) return;
        url = URL.createObjectURL(blob);
        setUploadedUrl(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [objectId, resolveImage]);

  if (!cover) return null;
  if (cover.kind === "preset") return coverBackground(cover);
  return uploadedUrl ? `url("${uploadedUrl}")` : null;
}

export function PageCover({
  cover,
  icon,
  canEdit,
  resolveImage,
  uploadImage,
  onChange,
  onError,
}: {
  cover: NoteCover;
  icon: PageIcon;
  canEdit: boolean;
  resolveImage: (objectId: string) => Promise<Blob>;
  uploadImage: (file: File) => Promise<string>;
  onChange: (values: PagePropertyValues) => void;
  onError: (message: string) => void;
}) {
  const background = useCoverUrl(cover, resolveImage);
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

  function startReposition(event: ReactPointerEvent<HTMLDivElement>) {
    if (!canEdit || activeCover.kind !== "upload") return;
    const box = surfaceRef.current?.getBoundingClientRect();
    if (!box) return;
    const startY = event.clientY;
    const initial = position;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlacing(true);
    const move = (moved: PointerEvent) =>
      setPosition(clampCoverPosition(initial + (moved.clientY - startY) / box.height));
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      setPlacing(false);
      setPosition((settled) => {
        if (settled !== activeCover.position)
          onChange({ pageIcon: icon, cover: { ...activeCover, position: settled } });
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
      onChange({ pageIcon: icon, cover: { kind: "upload", objectId, position: 0.5 } });
      onError("");
      setPickerOpen(false);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : "Could not use that picture");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div
      ref={surfaceRef}
      className={`note-page-cover ${placing ? "is-placing" : ""}`}
      style={{
        background: background ?? "var(--paper-2)",
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
        <div className="note-cover-actions">
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
              <div
                className="popover note-cover-picker absolute top-full right-0 z-50 mt-2 p-2"
                onPointerDown={(event) => event.stopPropagation()}
              >
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
                          pageIcon: icon,
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
                  onClick={() => fileRef.current?.click()}
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
            onClick={() => onChange({ pageIcon: icon, cover: null })}
          >
            Remove
          </button>
        </div>
      )}
    </div>
  );
}

export function PageIdentity({
  icon,
  cover,
  canEdit,
  onChange,
}: {
  icon: PageIcon;
  cover: NoteCover;
  canEdit: boolean;
  onChange: (values: PagePropertyValues) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useDismiss(pickerOpen, () => setPickerOpen(false));
  const choose = (next: PageIcon) => {
    onChange({ pageIcon: next, cover });
    setPickerOpen(false);
  };

  return (
    <div className="note-page-identity">
      {icon ? (
        <div ref={pickerRef} className="relative inline-flex">
          <button
            type="button"
            className="note-page-icon"
            aria-label="Change page icon"
            disabled={!canEdit}
            onClick={() => setPickerOpen((open) => !open)}
          >
            <PageIconGlyph icon={icon} />
          </button>
          {pickerOpen && <IconPicker onChoose={choose} onRemove={() => choose(null)} />}
        </div>
      ) : canEdit ? (
        <button
          type="button"
          className="note-add-property"
          onClick={() => onChange({ pageIcon: { kind: "emoji", value: "📝" }, cover })}
        >
          <Smile size={15} />
          Add icon
        </button>
      ) : null}
      {!cover && canEdit && (
        <button
          type="button"
          className="note-add-property"
          onClick={() =>
            onChange({
              pageIcon: icon,
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

function IconPicker({
  onChoose,
  onRemove,
}: {
  onChoose: (icon: PageIcon) => void;
  onRemove: () => void;
}) {
  return (
    <div className="popover note-icon-picker absolute top-full left-0 z-50 mt-1 p-2">
      <div className="flex items-center justify-between">
        <p className="menu-label">Emoji</p>
        <button type="button" className="icon-button" aria-label="Remove icon" onClick={onRemove}>
          <Trash2 size={15} />
        </button>
      </div>
      <div className="note-icon-grid">
        {EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => onChoose({ kind: "emoji", value: emoji })}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="menu-separator" />
      <p className="menu-label">Symbols</p>
      <div className="note-icon-grid">
        {PAGE_SYMBOLS.map((symbol) => {
          const Glyph = SYMBOLS[symbol];
          return (
            <button
              key={symbol}
              type="button"
              aria-label={symbol}
              onClick={() => onChoose({ kind: "symbol", value: symbol })}
            >
              <Glyph size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
