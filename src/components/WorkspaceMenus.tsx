import {
  AtSign,
  BookOpen,
  Contrast,
  Image,
  Layers,
  Palette,
  ShieldCheck,
  Timer,
  Type,
  ArrowDownAZ,
  ArrowDownUp,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  FolderInput,
  ImagePlus,
  Lock,
  Monitor,
  MoreHorizontal,
  Moon,
  Pin,
  Search,
  Settings,
  Sun,
  Trash2,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
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
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE,
  setAppearance,
  setTheme,
  setWallpaper,
  useAppearance,
  type ThemeMode,
} from "@/lib/appearance";
import type { Folder } from "@/lib/types";
import type { ListPreferences } from "@/lib/listPreferences";
import { ContextMenu } from "./ContextMenu";
import type { MenuPoint } from "@/lib/contextMenu";

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

export function MenuButton({
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

/* The items a note carries, wherever they are asked for: from the ⋯ in the
   editor toolbar, and from a right-click on the page. One list, two doors. */
function NoteMenuContent({
  pinned,
  folders,
  recent,
  onTogglePin,
  onFind,
  onMove,
  onRecent,
  onDelete,
  close,
}: {
  pinned: boolean;
  folders: Folder[];
  recent: { id: string; title: string }[];
  onTogglePin: () => void;
  onFind: () => void;
  onMove: (folderId: string | null) => void;
  onRecent: (id: string) => void;
  onDelete: () => void;
  close: () => void;
}) {
  const [section, setSection] = useState<"root" | "move" | "recent">("root");
  return (
    <>
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
    </>
  );
}

export function NoteMenu(props: {
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
  const close = () => setOpen(false);
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
          <NoteMenuContent {...props} close={close} />
        </div>
      )}
    </div>
  );
}

/** The same items, opened where the pointer is. */
export function NoteContextMenu({
  point,
  onClose,
  ...props
}: {
  point: MenuPoint;
  onClose: () => void;
  pinned: boolean;
  folders: Folder[];
  recent: { id: string; title: string }[];
  onTogglePin: () => void;
  onFind: () => void;
  onMove: (folderId: string | null) => void;
  onRecent: (id: string) => void;
  onDelete: () => void;
}) {
  return (
    <ContextMenu point={point} onClose={onClose}>
      <NoteMenuContent {...props} close={onClose} />
    </ContextMenu>
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
   Appearance, reading and account state each get their own clear section. */

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

/** The anatomy every settings row shares, and the one the profile page will
 *  reuse: a leading glyph, the name of the thing with a line saying what it
 *  does, and the control itself flush right. Naming the row is what lets the
 *  control stop explaining itself. */
function RowLead({ icon, label, hint }: { icon: ReactNode; label: string; hint?: string }) {
  return (
    <>
      <span className="settings-lead" aria-hidden="true">
        {icon}
      </span>
      <span className="settings-label">
        <b>{label}</b>
        {hint ? <small>{hint}</small> : null}
      </span>
    </>
  );
}

/** The appearance sliders, on the same control as the reading axes. They were
 *  bare `input[type=range]`, so the browser painted a blue nobody chose — two
 *  tabs of one dialog showing the same control two different ways. */
function AppearanceSlider({
  icon,
  label,
  hint,
  min,
  max,
  value,
  readout,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  min: number;
  max: number;
  value: number;
  readout: string;
  onChange: (value: number) => void;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="appearance-row is-slider">
      <RowLead icon={icon} label={label} hint={hint} />
      <input
        type="range"
        className="axis-range"
        style={{ "--fill": `${fill}%` } as React.CSSProperties}
        min={min}
        max={max}
        value={value}
        aria-label={`${label}, ${readout}`}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{readout}</output>
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

/** The letters that stand in for a face nobody has uploaded. */
function initialsOf(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0]?.replace(/[._-]+/g, " ") || "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export function Avatar({
  url,
  name,
  email,
  large = false,
}: {
  url: string | null;
  name: string;
  email: string;
  large?: boolean;
}) {
  return (
    <span className={`avatar ${large ? "is-large" : ""}`} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initialsOf(name, email)}
    </span>
  );
}

const SETTINGS_SECTIONS = [
  {
    group: "Account",
    items: [
      { id: "profile", name: "Profile", icon: <UserRound size={15} /> },
      { id: "security", name: "Security", icon: <ShieldCheck size={15} /> },
    ],
  },
  {
    group: "Interface",
    items: [
      { id: "appearance", name: "Appearance", icon: <Palette size={15} /> },
      { id: "reading", name: "Reading", icon: <BookOpen size={15} /> },
    ],
  },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["items"][number]["id"];

export function SettingsPanel({
  open,
  email,
  reading,
  autoLock,
  profile,
  avatarUrl,
  joinedAt,
  memberCount,
  profileBusy,
  profileError,
  onNicknameSave,
  onAvatarPick,
  onAvatarRemove,
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
  profile: { nickname: string; avatarObject: string | null };
  /** A local object URL for the picture, resolved by whoever owns the session. */
  avatarUrl: string | null;
  joinedAt?: string;
  memberCount: number;
  profileBusy: boolean;
  profileError: string;
  onNicknameSave: (nickname: string) => void;
  onAvatarPick: (file: File) => void;
  onAvatarRemove: () => void;
  onAutoLockChange: (minutes: AutoLockMinutes) => void;
  onClose: () => void;
  onLock: () => void;
}) {
  const axes = useAxes();
  const preset = matchingPreset(axes);
  const appearance = useAppearance();
  const [tuning, setTuning] = useState(false);
  const [section, setSection] = useState<SettingsSection>("profile");
  const [nickname, setNickname] = useState(profile.nickname);
  const wallpaperRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setTuning(false);
      setSection("profile");
    }
  }, [open]);

  /* The field follows the stored value while it is not being edited, so a
     nickname written on another device does not sit stale behind this one. */
  useEffect(() => {
    setNickname(profile.nickname);
  }, [profile.nickname]);

  function commitNickname() {
    const trimmed = nickname.trim().slice(0, 40);
    if (trimmed === profile.nickname) return;
    onNicknameSave(trimmed);
  }

  const themeChoices: { id: ThemeMode; name: string; icon: ReactNode }[] = [
    { id: "system", name: "System", icon: <Monitor size={18} /> },
    { id: "light", name: "Light", icon: <Sun size={18} /> },
    { id: "dark", name: "Dark", icon: <Moon size={18} /> },
  ];

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

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {SETTINGS_SECTIONS.map((group) => (
              <Fragment key={group.group}>
                <p className="settings-nav-group">{group.group}</p>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-current={section === item.id ? "page" : undefined}
                    className={section === item.id ? "is-active" : ""}
                    onClick={() => setSection(item.id)}
                  >
                    {item.icon}
                    {item.name}
                  </button>
                ))}
              </Fragment>
            ))}
          </nav>

          <div className="settings-scroll">
            {section === "profile" && (
              <section>
                <h3>Profile details</h3>

                <div className="profile-portrait">
                  <Avatar url={avatarUrl} name={profile.nickname} email={email} large />
                  <div className="min-w-0">
                    <b className="text-[14px] font-[560] text-ink">Picture</b>
                    <small className="mt-0.5 block text-[12.5px] text-ink-4">
                      Shown to everyone in this archive. Cropped square, kept small.
                    </small>
                    <input
                      ref={avatarRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) onAvatarPick(file);
                        event.target.value = "";
                      }}
                    />
                    <div className="profile-portrait-actions">
                      <button
                        type="button"
                        disabled={profileBusy}
                        onClick={() => avatarRef.current?.click()}
                      >
                        {profile.avatarObject ? "Change picture" : "Add a picture"}
                      </button>
                      {profile.avatarObject && (
                        <button
                          type="button"
                          className="is-danger"
                          disabled={profileBusy}
                          onClick={onAvatarRemove}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="appearance-row profile-row">
                  <RowLead
                    icon={<UserRound size={17} />}
                    label="Nickname"
                    hint="What others in this archive call you"
                  />
                  <input
                    className="profile-field"
                    value={nickname}
                    maxLength={40}
                    placeholder={email.split("@")[0]}
                    aria-label="Nickname"
                    disabled={profileBusy}
                    onChange={(event) => setNickname(event.target.value)}
                    onBlur={commitNickname}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      if (event.key === "Escape") setNickname(profile.nickname);
                    }}
                  />
                </div>

                <div className="appearance-row profile-row">
                  <RowLead
                    icon={<AtSign size={17} />}
                    label="Email"
                    hint="Where this account signs in"
                  />
                  <span className="profile-static">{email}</span>
                </div>

                <div className="appearance-row profile-row">
                  <RowLead
                    icon={<Users size={17} />}
                    label="Archive"
                    hint="Everyone here reads and writes everything"
                  />
                  <span className="profile-static">
                    {memberCount} {memberCount === 1 ? "member" : "members"}
                  </span>
                </div>

                {profileError && (
                  <p className="profile-note text-danger" role="alert">
                    {profileError}
                  </p>
                )}
                <p className="profile-note">
                  Your nickname and picture are the only things about you the others can see. Nobody
                  but this account can change them.
                </p>
              </section>
            )}

            {section === "appearance" && (
              <section>
                <h3>Theme</h3>
                <div className="theme-picker" role="radiogroup" aria-label="Theme">
                  {themeChoices.map((choice) => (
                    <button
                      key={choice.id}
                      type="button"
                      role="radio"
                      aria-checked={appearance.theme === choice.id}
                      className={appearance.theme === choice.id ? "is-active" : ""}
                      onClick={() => setTheme(choice.id)}
                    >
                      <span className={`theme-preview is-${choice.id}`}>
                        {choice.icon}
                        <i />
                        <b />
                      </span>
                      {choice.name}
                    </button>
                  ))}
                </div>

                <h3>Palette</h3>
                <div className="palette-presets" role="group" aria-label="Colour palettes">
                  {APPEARANCE_PRESETS.map((palette) => {
                    const active =
                      appearance.accent === palette.accent &&
                      appearance.background === palette.background &&
                      appearance.foreground === palette.foreground;
                    return (
                      <button
                        key={palette.id}
                        type="button"
                        aria-pressed={active}
                        className={active ? "is-active" : ""}
                        onClick={() =>
                          setAppearance({
                            ...appearance,
                            theme: palette.theme,
                            accent: palette.accent,
                            background: palette.background,
                            foreground: palette.foreground,
                          })
                        }
                      >
                        <span
                          className="palette-chip"
                          style={
                            {
                              "--palette-bg": palette.background,
                              "--palette-fg": palette.foreground,
                              "--palette-accent": palette.accent,
                            } as React.CSSProperties
                          }
                        />
                        {palette.name}
                      </button>
                    );
                  })}
                </div>

                <div className="appearance-controls">
                  {(
                    [
                      [
                        "Accent",
                        "accent",
                        "Selection, focus and every active state",
                        <Palette size={17} />,
                      ],
                      [
                        "Background",
                        "background",
                        "The colour every surface is mixed from",
                        <Type size={17} />,
                      ],
                      ["Foreground", "foreground", "Text colour", <Type size={17} />],
                    ] as const
                  ).map(([label, key, hint, icon]) => (
                    <label key={key} className="appearance-row">
                      <RowLead icon={icon} label={label} hint={hint} />
                      <span className="color-control">
                        <input
                          type="color"
                          value={appearance[key]}
                          onChange={(event) =>
                            setAppearance({ ...appearance, [key]: event.target.value })
                          }
                        />
                        <code>{appearance[key].toUpperCase()}</code>
                      </span>
                    </label>
                  ))}

                  <label className="appearance-row">
                    <RowLead
                      icon={<Layers size={17} />}
                      label="Translucent sidebar"
                      hint="Let the page show through the rail"
                    />
                    <input
                      type="checkbox"
                      role="switch"
                      checked={appearance.translucentSidebar}
                      onChange={(event) =>
                        setAppearance({ ...appearance, translucentSidebar: event.target.checked })
                      }
                    />
                  </label>

                  <AppearanceSlider
                    icon={<Contrast size={17} />}
                    label="Contrast"
                    hint="Distance between the stacked surfaces"
                    min={20}
                    max={80}
                    value={appearance.contrast}
                    readout={`${appearance.contrast}`}
                    onChange={(contrast) => setAppearance({ ...appearance, contrast })}
                  />

                  <div className="appearance-row wallpaper-row">
                    <RowLead
                      icon={<Image size={17} />}
                      label="Background image"
                      hint="Stored only on this device, never uploaded"
                    />
                    <input
                      ref={wallpaperRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void setWallpaper(file);
                        event.target.value = "";
                      }}
                    />
                    <span className="wallpaper-actions">
                      {appearance.wallpaper && (
                        <button type="button" onClick={() => void setWallpaper(null)}>
                          Remove
                        </button>
                      )}
                      <button type="button" onClick={() => wallpaperRef.current?.click()}>
                        <ImagePlus size={15} /> Choose
                      </button>
                    </span>
                  </div>

                  {appearance.wallpaper && (
                    <>
                      <div className="appearance-row wallpaper-fit-row">
                        <span>Image fit</span>
                        <span className="compact-segment" role="group" aria-label="Image fit">
                          {(["cover", "contain"] as const).map((fit) => (
                            <button
                              key={fit}
                              type="button"
                              aria-pressed={appearance.wallpaperFit === fit}
                              className={appearance.wallpaperFit === fit ? "is-active" : ""}
                              onClick={() => setAppearance({ ...appearance, wallpaperFit: fit })}
                            >
                              {fit === "cover" ? "Fill" : "Fit"}
                            </button>
                          ))}
                        </span>
                      </div>
                      <AppearanceSlider
                        icon={<Contrast size={17} />}
                        label="Darken image"
                        min={0}
                        max={80}
                        value={appearance.wallpaperDim}
                        readout={`${appearance.wallpaperDim}%`}
                        onChange={(wallpaperDim) => setAppearance({ ...appearance, wallpaperDim })}
                      />
                      <AppearanceSlider
                        icon={<Layers size={17} />}
                        label="Blur"
                        min={0}
                        max={20}
                        value={appearance.wallpaperBlur}
                        readout={`${appearance.wallpaperBlur}px`}
                        onChange={(wallpaperBlur) =>
                          setAppearance({ ...appearance, wallpaperBlur })
                        }
                      />
                    </>
                  )}
                </div>

                <button
                  type="button"
                  className="settings-reset"
                  onClick={() =>
                    void setWallpaper(null).then(() => setAppearance(DEFAULT_APPEARANCE))
                  }
                >
                  Reset appearance
                </button>
              </section>
            )}

            {section === "reading" && (
              <section>
                <h3>Reading</h3>
                <div className="settings-specimen" aria-hidden="true">
                  <p>
                    Set the page for the way you read. Every note follows these choices instantly.
                  </p>
                </div>
                <Segmented
                  label="Reading preset"
                  value={preset?.id ?? null}
                  options={PRESETS.map((item) => ({
                    id: item.id,
                    name: item.name,
                    hint: item.role,
                  }))}
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
            )}

            {section === "security" && (
              <section>
                <h3>Security</h3>
                <dl className="settings-facts">
                  <div>
                    <span className="settings-lead" aria-hidden="true">
                      <ShieldCheck size={17} />
                    </span>
                    <span className="settings-label">
                      <dt>Storage</dt>
                      <dd>Protected by your account</dd>
                    </span>
                  </div>
                  <div>
                    <span className="settings-lead" aria-hidden="true">
                      <BookOpen size={17} />
                    </span>
                    <span className="settings-label">
                      <dt>Reading</dt>
                      <dd>{reading}</dd>
                    </span>
                  </div>
                </dl>
                <div className="settings-row account-lock-row">
                  <span className="settings-lead" aria-hidden="true">
                    <Timer size={17} />
                  </span>
                  <span className="settings-label">
                    <b>Sign out when idle</b>
                    <small>Require the account password again after a period of inactivity.</small>
                  </span>
                </div>
                <Segmented
                  label="Sign out when idle"
                  value={String(autoLock)}
                  options={AUTO_LOCK_CHOICES.map((minutes) => ({
                    id: String(minutes),
                    name: AUTO_LOCK_LABELS[minutes],
                  }))}
                  onChange={(id) => onAutoLockChange(Number(id) as AutoLockMinutes)}
                />
                <p className="profile-note">
                  Membership is the whole of the boundary: everyone in this archive reads and writes
                  every note in it. Somebody who should not read these needs an archive of their
                  own.
                </p>
              </section>
            )}
          </div>

          {/* Who this is, standing beside whatever is being changed. */}
          <aside className="settings-aside" aria-label="Account summary">
            <div className="settings-aside-block">
              <p className="settings-aside-label">Signed in as</p>
              <div className="settings-aside-identity">
                <Avatar url={avatarUrl} name={profile.nickname} email={email} />
                <span className="settings-aside-value min-w-0">
                  {profile.nickname || email.split("@")[0]}
                </span>
              </div>
            </div>

            <dl className="settings-aside-block">
              <dt>Email</dt>
              <dd>{email}</dd>
            </dl>

            {joinedAt && (
              <dl className="settings-aside-block">
                <dt>Member since</dt>
                <dd>
                  {new Date(joinedAt).toLocaleDateString(undefined, {
                    month: "long",
                    year: "numeric",
                  })}
                </dd>
              </dl>
            )}

            <dl className="settings-aside-block">
              <dt>Reading</dt>
              <dd>{reading}</dd>
            </dl>

            <div className="settings-aside-block">
              <p className="settings-aside-label">Sign out</p>
              <p>
                Ends this session on this device. Your notes stay where they are, and the account
                opens them again.
              </p>
              <button type="button" className="settings-lock press" onClick={onLock}>
                <Lock size={16} />
                Sign out
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
