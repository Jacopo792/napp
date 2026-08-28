import {
  ArrowDownAZ,
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FolderInput,
  GalleryHorizontalEnd,
  List,
  Lock,
  MoreHorizontal,
  Pin,
  Search,
  Settings,
  SlidersHorizontal,
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

export function MainMenu({ onSettings, onLock }: { onSettings: () => void; onLock: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Main menu"
        aria-expanded={open}
        className="toolbar-button"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div
          role="menu"
          className="popover menu-popover absolute top-full left-0 z-50 mt-2 w-52 p-1.5"
        >
          <MenuButton
            onClick={() => {
              close();
              onSettings();
            }}
          >
            <Settings size={16} />
            Settings
          </MenuButton>
          <div className="menu-separator" />
          <MenuButton
            onClick={() => {
              close();
              onLock();
            }}
          >
            <Lock size={16} />
            Lock &amp; sign out
          </MenuButton>
        </div>
      )}
    </div>
  );
}

export function CollectionMenu({
  preferences,
  folderName,
  canManageFolder,
  onChange,
  onNewFolder,
  onRenameFolder,
  onDeleteFolder,
}: {
  preferences: ListPreferences;
  folderName: string;
  canManageFolder: boolean;
  onChange: (next: ListPreferences) => void;
  onNewFolder: (name: string) => void;
  onRenameFolder: (name: string) => void;
  onDeleteFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<"new" | "rename" | null>(null);
  const [value, setValue] = useState("");
  const close = () => {
    setOpen(false);
    setEditing(null);
  };
  const ref = useDismiss(open, close);

  function submit() {
    const name = value.trim();
    if (!name) return;
    if (editing === "new") onNewFolder(name);
    if (editing === "rename") onRenameFolder(name);
    close();
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={`Options for ${folderName}`}
        aria-expanded={open}
        className="toolbar-button"
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div
          role="menu"
          className="popover menu-popover absolute top-full right-0 z-50 mt-2 w-64 p-1.5"
        >
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              className="p-2"
            >
              <label className="label mb-2 block text-ink-3">
                {editing === "new" ? "New folder" : "Rename folder"}
              </label>
              <input
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
                className="menu-input"
                placeholder="Folder name"
              />
              <div className="mt-2 flex justify-end gap-2">
                <button
                  type="button"
                  className="menu-small-button"
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="menu-small-button is-primary">
                  Save
                </button>
              </div>
            </form>
          ) : (
            <>
              <MenuButton
                onClick={() => {
                  setValue("");
                  setEditing("new");
                }}
              >
                <FolderInput size={16} />
                New folder
              </MenuButton>
              {canManageFolder && (
                <MenuButton
                  onClick={() => {
                    setValue(folderName);
                    setEditing("rename");
                  }}
                >
                  <SlidersHorizontal size={16} />
                  Rename folder
                </MenuButton>
              )}
              <div className="menu-separator" />
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
              <MenuButton
                active={preferences.view === "list"}
                onClick={() => onChange({ ...preferences, view: "list" })}
              >
                <List size={16} />
                List view
              </MenuButton>
              <MenuButton
                active={preferences.view === "gallery"}
                onClick={() => onChange({ ...preferences, view: "gallery" })}
              >
                <GalleryHorizontalEnd size={16} />
                Gallery view
              </MenuButton>
              {canManageFolder && (
                <>
                  <div className="menu-separator" />
                  <MenuButton
                    danger
                    onClick={() => {
                      close();
                      onDeleteFolder();
                    }}
                  >
                    <Trash2 size={16} />
                    Delete folder
                  </MenuButton>
                </>
              )}
            </>
          )}
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
                <ChevronRight size={15} className="ml-auto" />
              </MenuButton>
              <MenuButton onClick={() => setSection("recent")}>
                <Clock3 size={16} />
                Recent notes
                <ChevronRight size={15} className="ml-auto" />
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

function AxisSlider({ spec, axes }: { spec: (typeof AXIS_SPECS)[number]; axes: Axes }) {
  const value = axes[spec.key];
  return (
    <label className="settings-field">
      <span>{spec.label}</span>
      <output>
        {spec.key === "leading" ? value.toFixed(2) : value}
        {spec.unit}
      </output>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(event) => setAxis(spec.key, Number(event.target.value))}
      />
    </label>
  );
}

export function SettingsPanel({
  open,
  preferences,
  onClose,
  onPreferencesChange,
  onLock,
}: {
  open: boolean;
  preferences: ListPreferences;
  onClose: () => void;
  onPreferencesChange: (next: ListPreferences) => void;
  onLock: () => void;
}) {
  const axes = useAxes();
  const preset = matchingPreset(axes);
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
        <header className="flex items-center border-b border-rule px-5 py-4">
          <div>
            <h2 id="settings-title" className="font-display text-xl font-semibold">
              Settings
            </h2>
            <p className="mt-0.5 text-sm text-ink-4">Local reading and list preferences</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="icon-button ml-auto h-9 w-9"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="settings-scroll">
          <section>
            <h3>Reading appearance</h3>
            <div className="settings-presets">
              {PRESETS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={preset?.id === item.id}
                  className={preset?.id === item.id ? "is-active" : ""}
                  onClick={() => setAxes(item.axes)}
                >
                  <span>{item.name}</span>
                  <small>{item.role}</small>
                </button>
              ))}
            </div>
            <div className="settings-sliders">
              {AXIS_SPECS.map((spec) => (
                <AxisSlider key={spec.key} spec={spec} axes={axes} />
              ))}
            </div>
          </section>
          <section>
            <h3>List preferences</h3>
            <div className="settings-choice">
              <button
                type="button"
                className={preferences.view === "list" ? "is-active" : ""}
                onClick={() => onPreferencesChange({ ...preferences, view: "list" })}
              >
                <List size={17} />
                List
              </button>
              <button
                type="button"
                className={preferences.view === "gallery" ? "is-active" : ""}
                onClick={() => onPreferencesChange({ ...preferences, view: "gallery" })}
              >
                <GalleryHorizontalEnd size={17} />
                Gallery
              </button>
            </div>
            <label className="settings-toggle">
              <span>
                <b>Group by date</b>
                <small>Keep pinned notes separate, then use calendar buckets.</small>
              </span>
              <input
                type="checkbox"
                checked={preferences.groupByDate}
                onChange={(event) =>
                  onPreferencesChange({ ...preferences, groupByDate: event.target.checked })
                }
              />
            </label>
          </section>
          <section>
            <h3>Archive</h3>
            <button type="button" className="settings-lock" onClick={onLock}>
              <Lock size={17} />
              Lock &amp; sign out
            </button>
          </section>
        </div>
      </section>
    </div>
  );
}
