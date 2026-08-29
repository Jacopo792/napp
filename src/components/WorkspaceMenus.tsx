import {
  ArrowDownAZ,
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FolderInput,
  Lock,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AXIS_SPECS,
  PRESETS,
  matchingPreset,
  setAxes,
  setAxis,
  useAxes,
  type Axes,
} from "@/lib/axes";
import { AUTO_LOCK_CHOICES, AUTO_LOCK_LABELS, type AutoLockMinutes } from "@/lib/autoLock";
import type { Folder } from "@/lib/types";
import type { ListPreferences } from "@/lib/listPreferences";

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);
  return ref;
}

function MenuButton({
  children,
  active = false,
  danger = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`menu-row ${danger ? "text-danger" : active ? "text-accent" : "text-ink-2"}`}
    >
      {children}
      {active && <Check size={14} className="ml-auto" />}
    </button>
  );
}

/**
 * Settings and the lock, at the bottom of the leftmost column.
 *
 * They used to hide behind a three-dot button at the top of a rail that no
 * longer exists — two destinations behind a menu that existed only to hold
 * them. Standing where an application's account controls stand, they are one
 * click each and the menu is gone.
 */
export function WorkspaceFooter({
  compact = false,
  onSettings,
  onLock,
}: {
  compact?: boolean;
  onSettings: () => void;
  onLock: () => void;
}) {
  return (
    <div className={`workspace-footer ${compact ? "is-compact" : ""}`}>
      <button type="button" className="workspace-footer-button press" onClick={onSettings}>
        <Settings size={16} />
        <span>Settings</span>
      </button>
      <button type="button" className="workspace-footer-button press" onClick={onLock}>
        <Lock size={16} />
        <span>Lock &amp; sign out</span>
      </button>
    </div>
  );
}

/**
 * How the list is ordered, and how it is drawn.
 *
 * *What* it shows is the sidebar's job now, so the scope list and the tag
 * filter have both left this menu: it is about sorting and view, which is what
 * the icon on the collection header has always promised.
 */
export function CollectionMenu({
  preferences,
  onChange,
}: {
  preferences: ListPreferences;
  onChange: (next: ListPreferences) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="List options"
        title="Sort and view"
        aria-expanded={open}
        className="toolbar-button press"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="popover menu-popover absolute top-full right-0 z-50 mt-2 w-60 p-1.5"
        >
          <p className="menu-label">Sort by</p>
          {(["updated", "created", "title"] as const).map((criterion) => (
            <MenuButton
              key={criterion}
              active={preferences.sortBy === criterion}
              onClick={() => onChange({ ...preferences, sortBy: criterion })}
            >
              {criterion === "title" ? <ArrowDownAZ size={16} /> : <Clock3 size={16} />}
              {criterion === "updated"
                ? "Date edited"
                : criterion === "created"
                  ? "Date created"
                  : "Title"}
            </MenuButton>
          ))}
          <div className="menu-separator" />
          <MenuButton
            active={preferences.direction === "desc"}
            onClick={() => onChange({ ...preferences, direction: "desc" })}
          >
            <ArrowDownUp size={16} />
            Newest first
          </MenuButton>
          <MenuButton
            active={preferences.direction === "asc"}
            onClick={() => onChange({ ...preferences, direction: "asc" })}
          >
            <ArrowDownUp size={16} className="rotate-180" />
            Oldest first
          </MenuButton>
          <div className="menu-separator" />
          <MenuButton
            active={preferences.groupByDate}
            onClick={() => onChange({ ...preferences, groupByDate: !preferences.groupByDate })}
          >
            <CalendarDays size={16} />
            Group by date
          </MenuButton>
        </div>
      )}
    </div>
  );
}

export function NoteMenu({
  pinned,
  folders,
  recent,
  onTogglePin,
  onFind,
  onMove,
  onRecent,
  onDelete,
}: {
  pinned: boolean;
  folders: Folder[];
  recent: { id: string; title: string }[];
  onTogglePin: () => void;
  onFind: () => void;
  onMove: (folderId: string | null) => void;
  onRecent: (id: string) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<"root" | "move" | "recent">("root");
  const close = () => {
    setOpen(false);
    setSection("root");
  };
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Note actions"
        aria-expanded={open}
        className="toolbar-button"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="popover menu-popover absolute top-full right-0 z-50 mt-2 w-60 p-1.5"
        >
          {section !== "root" && (
            <MenuButton onClick={() => setSection("root")}>
              <ChevronRight size={16} className="rotate-180" />
              Back
            </MenuButton>
          )}
          {section === "root" && (
            <>
              <MenuButton
                active={pinned}
                onClick={() => {
                  onTogglePin();
                  close();
                }}
              >
                <Pin size={16} />
                {pinned ? "Unpin note" : "Pin note"}
              </MenuButton>
              <MenuButton
                onClick={() => {
                  onFind();
                  close();
                }}
              >
                <Search size={16} />
                Find in note
              </MenuButton>
              <div className="menu-separator" />
              <MenuButton onClick={() => setSection("move")}>
                <FolderInput size={16} />
                Move note
                <ChevronRight size={16} className="ml-auto" />
              </MenuButton>
              <MenuButton onClick={() => setSection("recent")}>
                <Clock3 size={16} />
                Recent notes
                <ChevronRight size={16} className="ml-auto" />
              </MenuButton>
              <div className="menu-separator" />
              <MenuButton
                danger
                onClick={() => {
                  onDelete();
                  close();
                }}
              >
                <Trash2 size={16} />
                Delete note
              </MenuButton>
            </>
          )}
          {section === "move" && (
            <>
              <p className="menu-label">Move to</p>
              <MenuButton
                onClick={() => {
                  onMove(null);
                  close();
                }}
              >
                <FolderInput size={16} />
                Unfiled
              </MenuButton>
              {folders.map((folder) => (
                <MenuButton
                  key={folder.id}
                  onClick={() => {
                    onMove(folder.id);
                    close();
                  }}
                >
                  <FolderInput size={16} />
                  {folder.name}
                </MenuButton>
              ))}
            </>
          )}
          {section === "recent" && (
            <>
              <p className="menu-label">Recent notes</p>
              {recent.length ? (
                recent.map((note) => (
                  <MenuButton
                    key={note.id}
                    onClick={() => {
                      onRecent(note.id);
                      close();
                    }}
                  >
                    <Clock3 size={16} />
                    <span className="truncate">{note.title || "Untitled"}</span>
                  </MenuButton>
                ))
              ) : (
                <p className="px-3 py-4 text-sm text-ink-4">No recent notes yet</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Settings ────────────────────────────────────────────────────────────────
   What a preferences sheet in this application is actually for.

   It used to hold three things, and not one of them earned the modal. The
   reading axes were four unlabelled tracks whose effect was hidden behind the
   very panel you were dragging them in. List-versus-gallery was a choice the
   window size already makes correctly on its own. Group-by-date and the lock
   were both duplicates — of the ⋯ menu on the list header, and of the button
   sitting one row above Settings in the same column.

   So: the axes stay, but with a specimen that changes under the slider, which
   is the whole difference between a control you understand and four numbers.
   The duplicates are gone. In their place is the one preference this app has
   that protects something — when a shared, encrypted archive locks itself —
   and the plain statement of whose notes you are reading and where the
   ciphertext goes, which had nowhere to live at all. ────────────────────── */

function AxisSlider({ spec, axes }: { spec: (typeof AXIS_SPECS)[number]; axes: Axes }) {
  const value = axes[spec.key];
  const fill = ((value - spec.min) / (spec.max - spec.min)) * 100;
  return (
    <label className="settings-field">
      <span>{spec.label}</span>
      <output>
        {spec.key === "leading" ? value.toFixed(2) : value}
        {spec.unit}
      </output>
      <input
        type="range"
        className="axis-range"
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        aria-label={`${spec.label}, ${value}${spec.unit}`}
        onChange={(event) => setAxis(spec.key, Number(event.target.value))}
      />
    </label>
  );
}

/** A row of mutually exclusive choices, the shape the platform uses for four
 *  or fewer options that fit on one line. */
function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; name: string; hint?: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="settings-segment" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          className={`press ${value === option.id ? "is-active" : ""}`}
          onClick={() => onChange(option.id)}
        >
          <span>{option.name}</span>
          {option.hint && <small>{option.hint}</small>}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({
  open,
  email,
  reading,
  autoLock,
  onAutoLockChange,
  onClose,
  onLock,
}: {
  open: boolean;
  /** The account signed in, which is not the same thing as the notes on screen. */
  email: string;
  /** Whose notes the window is currently pointed at. */
  reading: string;
  autoLock: AutoLockMinutes;
  onAutoLockChange: (minutes: AutoLockMinutes) => void;
  onClose: () => void;
  onLock: () => void;
}) {
  const axes = useAxes();
  const preset = matchingPreset(axes);
  const [tuning, setTuning] = useState(false);

  useEffect(() => {
    if (!open) setTuning(false);
  }, [open]);

  if (!open) return null;
  return (
    <div className="settings-layer" role="presentation">
      <button
        type="button"
        aria-label="Close settings"
        className="settings-scrim"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-panel glass-sheet"
      >
        <header className="settings-header">
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Kept in this browser, on this device</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="icon-button press ml-auto h-9 w-9"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>

        <div className="settings-scroll">
          <section>
            <h3>Reading</h3>

            {/* The specimen is the control. It is set from the same four custom
                properties the note itself reads, so what moves here is exactly
                what will have moved when the panel closes. */}
            <div className="settings-specimen" aria-hidden="true">
              <p>
                The note is the calmest place in the app. Set the type the way you actually read —
                larger for a long evening, narrower to keep one thought in view — and every note
                follows.
              </p>
            </div>

            <Segmented
              label="Reading preset"
              value={preset?.id ?? null}
              options={PRESETS.map((item) => ({ id: item.id, name: item.name, hint: item.role }))}
              onChange={(id) => {
                const chosen = PRESETS.find((item) => item.id === id);
                if (chosen) setAxes(chosen.axes);
              }}
            />

            <button
              type="button"
              className={`settings-disclosure press ${tuning ? "is-open" : ""}`}
              aria-expanded={tuning}
              onClick={() => setTuning((current) => !current)}
            >
              <ChevronRight size={14} />
              <span>Fine-tune</span>
              <small>{preset ? preset.name : "Custom"}</small>
            </button>

            {tuning && (
              <div className="settings-sliders">
                {AXIS_SPECS.map((spec) => (
                  <AxisSlider key={spec.key} spec={spec} axes={axes} />
                ))}
              </div>
            )}
          </section>

          <section>
            <h3>Security</h3>
            <div className="settings-row">
              <span>
                <b>Lock when idle</b>
                <small>
                  The key is dropped from this browser and reading again means signing in. Nothing
                  is deleted.
                </small>
              </span>
            </div>
            <Segmented
              label="Lock when idle"
              value={String(autoLock)}
              options={AUTO_LOCK_CHOICES.map((minutes) => ({
                id: String(minutes),
                name: AUTO_LOCK_LABELS[minutes],
              }))}
              onChange={(id) => onAutoLockChange(Number(id) as AutoLockMinutes)}
            />
          </section>

          <section>
            <h3>This archive</h3>
            <dl className="settings-facts">
              <div>
                <dt>Signed in</dt>
                <dd>{email}</dd>
              </div>
              <div>
                <dt>Reading</dt>
                <dd>{reading}</dd>
              </div>
              <div>
                <dt>Encryption</dt>
                <dd>
                  <ShieldCheck size={14} className="text-ok" />
                  In this browser
                </dd>
              </div>
            </dl>
            <p className="settings-note">
              Notes, folder names and attachments are encrypted here before they are sent. Supabase
              stores ciphertext and never holds a key.
            </p>
            <button type="button" className="settings-lock press" onClick={onLock}>
              <Lock size={16} />
              Lock &amp; sign out
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
