import {
  Archive,
  ArchiveRestore,
  ClipboardCopy,
  Columns2,
  Keyboard,
  Maximize2,
  Minimize2,
  FileDown,
  FolderDown,
  AtSign,
  BookOpen,
  Contrast,
  Copy,
  Image,
  Layers,
  LogOut,
  Mail,
  Palette,
  ShieldCheck,
  Timer,
  Type,
  ArrowDownAZ,
  ArrowDownUp,
  CalendarDays,
  ChevronRight,
  Clock3,
  FolderInput,
  ImagePlus,
  Lock,
  LockOpen,
  Monitor,
  MoreHorizontal,
  Moon,
  Pin,
  Printer,
  Search,
  Settings,
  SpellCheck,
  Sun,
  Trash2,
  Undo2,
  UserRound,
  UserPlus,
  MousePointer2,
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
import { SHORTCUTS, shortcutGroups } from "@/lib/shortcuts";
import { AvatarCropper } from "@/components/AvatarCropper";
import type { AvatarCrop } from "@/lib/image";
import {
  APPEARANCE_PRESETS,
  DEFAULT_APPEARANCE,
  setAppearance,
  setTheme,
  setWallpaper,
  useAppearance,
  type ThemeMode,
} from "@/lib/appearance";
import type { Folder, NoteLock } from "@/lib/types";
import type { ListPreferences } from "@/lib/listPreferences";
import { ContextMenu } from "./ContextMenu";
import type { MenuPoint } from "@/lib/contextMenu";
import { MenuButton } from "./MenuPrimitives";
import { useDismiss } from "./useDismiss";
import { PRESENCE_PALETTES, type WritingPreferences } from "@/lib/writingPreferences";
import { Avatar } from "./WorkspaceMenus";
/* Settings, in a chunk of its own.
 *
 * It is one panel behind one button, opened rarely and never on the way to a
 * note — and it was riding in the chunk the archive itself is in, so every
 * first load paid for the roster, the invitations, the appearance sliders and
 * the shortcut sheet before it could draw a list of notes. It lives here so
 * `notes.tsx` can ask for it only when somebody opens it. */

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
/** Seven days is the invitation's whole life, so what is left of it is said in
 *  days rather than as a date nobody can subtract at a glance. */
function expiresIn(expiresAt: string): string {
  const days = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "expires today";
  if (days === 1) return "expires tomorrow";
  return `expires in ${days} days`;
}

/** The message is composed and sent by the member's own mail app: the token
 *  reaches the invited address without passing through anything of ours, and
 *  there is no server here to send it with. */
function inviteMailto(email: string, link: string): string {
  const subject = "An invitation to a shared notes archive";
  const body = [
    "You have been invited to a private notes archive.",
    "",
    "Open this link, then create an account with this address (or sign in, if you already have one):",
    link,
    "",
    "The link works once and expires in seven days.",
  ].join("\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(body)}`;
}

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

const SETTINGS_SECTIONS = [
  {
    group: "Account",
    items: [
      { id: "profile", name: "Profile", icon: <UserRound size={16} /> },
      { id: "members", name: "Members", icon: <Users size={16} /> },
      { id: "security", name: "Security", icon: <ShieldCheck size={16} /> },
    ],
  },
  {
    group: "Interface",
    items: [
      { id: "appearance", name: "Appearance", icon: <Palette size={16} /> },
      { id: "reading", name: "Reading", icon: <BookOpen size={16} /> },
      { id: "writing", name: "Writing", icon: <Type size={16} /> },
      { id: "shortcuts", name: "Shortcuts", icon: <Keyboard size={16} /> },
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
  members,
  seatLimit,
  invites,
  canManageMembers,
  presenceEnabled,
  collaboratorsVisible,
  proofreaderEnabled,
  writingPreferences,
  profileBusy,
  profileError,
  onNicknameSave,
  onAvatarPick,
  onAvatarRemove,
  onCreateInvite,
  onRevokeInvite,
  onLeaveArchive,
  onPresenceEnabledChange,
  onCollaboratorsVisibleChange,
  onProofreaderEnabledChange,
  onWritingPreferencesChange,
  onHideArchivedChange,
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
  profile: { nickname: string; avatarObject: string | null; hideArchived: boolean };
  /** A local object URL for the picture, resolved by whoever owns the session. */
  avatarUrl: string | null;
  joinedAt?: string;
  memberCount: number;
  members: {
    userId: string;
    nickname: string;
    isSelf: boolean;
  }[];
  /** How many members the archive holds room for. Two, by design. */
  seatLimit: number;
  /** Invitations nobody has claimed yet; each one is holding a seat. */
  invites: { id: string; email: string; expiresAt: string }[];
  canManageMembers: boolean;
  presenceEnabled: boolean;
  collaboratorsVisible: boolean;
  proofreaderEnabled: boolean;
  writingPreferences: WritingPreferences;
  profileBusy: boolean;
  profileError: string;
  onNicknameSave: (nickname: string) => void;
  onAvatarPick: (file: File, crop: AvatarCrop) => void;
  onAvatarRemove: () => void;
  onCreateInvite: (email: string) => Promise<string>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onLeaveArchive: () => Promise<void>;
  onPresenceEnabledChange: (enabled: boolean) => void;
  onCollaboratorsVisibleChange: (visible: boolean) => void;
  onProofreaderEnabledChange: (enabled: boolean) => void;
  onWritingPreferencesChange: (next: WritingPreferences) => void;
  onHideArchivedChange: (hideArchived: boolean) => void;
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
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [inviteStatus, setInviteStatus] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  /** The file waits here while its square is chosen; nothing is uploaded until
   *  the cropper is confirmed. */
  const [cropping, setCropping] = useState<File | null>(null);
  const [leaveConfirm, setLeaveConfirm] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveStatus, setLeaveStatus] = useState("");
  const wallpaperRef = useRef<HTMLInputElement>(null);
  const avatarRef = useRef<HTMLInputElement>(null);
  const navList = useRef<HTMLDivElement>(null);
  /* Where the selection sits in the rail. One element that travels, rather than
     a background that appears on the button you clicked and disappears from the
     one you left: the difference is whether the eye is told the selection
     moved, or has to work out that it did. Measured, because the group
     headings between the buttons mean no arithmetic on the index gives the
     right offset. */
  const [marker, setMarker] = useState<{ top: number; height: number } | null>(null);
  /* The marker travels between sections, and must not travel when it is merely
     being corrected. Which of the two this is, is exactly "did the section
     change since the last time it was placed". */
  const placedFor = useRef(section);
  const [travelling, setTravelling] = useState(false);

  /* Re-measured whenever anything in the rail changes size, not only when the
     section changes. Measuring once on open was wrong by ten pixels every
     first open: the effect runs before the rail has settled — the group
     headings restyle when the sans face swaps in, the identity block above
     resizes when the avatar and the nickname arrive. A ResizeObserver over the
     list and its children answers "did anything move?" without having to name
     which of those three it was, and covers the window resize the deps never
     mentioned either.

     And the correction is applied *without* the transition, which is the other
     half and is what was still visible. The marker animates so the eye is told
     the selection moved; a re-measurement is not the selection moving, it is
     the marker admitting it was in the wrong place. Left animated, the first
     open showed the wash sliding ten pixels down into position under "Profile"
     — the fill that looked wrong until you clicked something else. It travels
     when the section changes and is placed instantly the rest of the time. */
  useEffect(() => {
    if (!open) return;
    const list = navList.current;
    if (!list) return;

    const measure = () => {
      const active = list.querySelector<HTMLElement>("button.is-active");
      setTravelling(placedFor.current !== section);
      placedFor.current = section;
      setMarker(active ? { top: active.offsetTop, height: active.offsetHeight } : null);
    };
    measure();

    /* `border-box`, because the change that started all of this was a change of
       padding — and a content box does not notice one, which is why this
       observer sat there watching the exact element that moved and reported
       nothing. */
    const observer = new ResizeObserver(measure);
    observer.observe(list, { box: "border-box" });
    for (const child of list.children) observer.observe(child, { box: "border-box" });
    return () => observer.disconnect();
  }, [open, section]);

  useEffect(() => {
    if (!open) {
      setTuning(false);
      setSection("profile");
      setInviteEmail("");
      setInviteLink("");
      setInviteStatus("");
      setLeaveConfirm(false);
      setLeaveBusy(false);
      setLeaveStatus("");
      setCropping(null);
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

  async function createInvite() {
    const target = inviteEmail.trim();
    if (!target) return;
    setInviteBusy(true);
    setInviteStatus("");
    try {
      setInviteLink(await onCreateInvite(target));
      setInviteStatus("Invitation ready. Copy the link or send it by email.");
    } catch (reason) {
      setInviteStatus(reason instanceof Error ? reason.message : "Invitation failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function withdrawInvite(inviteId: string) {
    setInviteBusy(true);
    setInviteStatus("");
    try {
      await onRevokeInvite(inviteId);
      setInviteLink("");
      setInviteStatus("Invitation withdrawn. Its link no longer works.");
    } catch (reason) {
      setInviteStatus(reason instanceof Error ? reason.message : "Could not withdraw it");
    } finally {
      setInviteBusy(false);
    }
  }

  /* A seat is held by a member or by an invitation waiting to be claimed. The
     same arithmetic the database enforces, so the form is closed before the
     write is refused rather than after. */
  const seatsTaken = members.length + invites.length;
  const seatsFull = seatsTaken >= seatLimit;

  async function leaveArchive() {
    if (!leaveConfirm) {
      setLeaveConfirm(true);
      setLeaveStatus(
        "Confirm to leave. Your access ends immediately; notes stay with the archive.",
      );
      return;
    }
    setLeaveBusy(true);
    setLeaveStatus("");
    try {
      await onLeaveArchive();
    } catch (reason) {
      setLeaveConfirm(false);
      setLeaveStatus(reason instanceof Error ? reason.message : "Could not leave this archive");
    } finally {
      setLeaveBusy(false);
    }
  }

  const themeChoices: { id: ThemeMode; name: string; icon: ReactNode }[] = [
    { id: "system", name: "System", icon: <Monitor size={20} /> },
    { id: "light", name: "Light", icon: <Sun size={20} /> },
    { id: "dark", name: "Dark", icon: <Moon size={20} /> },
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
            <p>Kept with your account, on every browser you sign in from</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="icon-button press ml-auto h-9 w-9"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>

        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {/* Who this is, at the head of the rail rather than in a column of
                its own on the far side. It was a standing summary opposite the
                form, and everything it said the form said too — the one thing
                it added was the answer to "which account is this?", which
                belongs beside the way out, not beside the controls. */}
            <div className="settings-identity">
              <Avatar url={avatarUrl} name={profile.nickname} email={email} />
              <div className="min-w-0">
                <b>{profile.nickname || email.split("@")[0]}</b>
                <small>{email}</small>
              </div>
            </div>

            <div ref={navList} className="settings-nav-list">
              {marker && (
                <span
                  aria-hidden="true"
                  className={`settings-nav-marker ${travelling ? "" : "is-placed"}`}
                  style={{ transform: `translateY(${marker.top}px)`, height: marker.height }}
                />
              )}
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
            </div>

            {/* Leaving is not a section of Settings, so it does not sit in the
                list of them — it sits under the list, at the bottom of the
                column, which is where an application has put "sign out" for
                thirty years. The summary opposite keeps the sentence about
                what leaving costs; this is the door. */}
            <button type="button" className="settings-nav-signout press" onClick={onLock}>
              <Lock size={16} />
              Sign out
            </button>
          </nav>

          <div key={section} className="settings-scroll">
            {section === "profile" && (
              <section>
                <h3>Profile details</h3>

                <div className="profile-portrait">
                  <div className="appearance-row">
                    <RowLead
                      icon={<ImagePlus size={16} />}
                      label="Picture"
                      hint="Shown to everyone in this archive. Kept square and small."
                    />
                    <Avatar url={avatarUrl} name={profile.nickname} email={email} large />
                  </div>
                  <input
                    ref={avatarRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) setCropping(file);
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

                <div className="appearance-controls">
                  <div className="appearance-row profile-row">
                    <RowLead
                      icon={<UserRound size={16} />}
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
                      icon={<AtSign size={16} />}
                      label="Email"
                      hint="Where this account signs in"
                    />
                    <span className="profile-static">{email}</span>
                  </div>

                  <div className="appearance-row profile-row">
                    <RowLead
                      icon={<Users size={16} />}
                      label="Archive"
                      hint="Everybody here reads and writes every note"
                    />
                    <span className="profile-static">
                      {memberCount} {memberCount === 1 ? "member" : "members"}
                    </span>
                  </div>

                  {/* The two facts the summary column carried and no section
                      did. They are facts about this account, so this is where
                      they were always going to end up. */}
                  <div className="appearance-row profile-row">
                    <RowLead
                      icon={<Layers size={16} />}
                      label="Reading"
                      hint="Whose notes the window is pointed at"
                    />
                    <span className="profile-static">{reading}</span>
                  </div>

                  {joinedAt && (
                    <div className="appearance-row profile-row">
                      <RowLead
                        icon={<CalendarDays size={16} />}
                        label="Member since"
                        hint="When this account joined the archive"
                      />
                      <span className="profile-static">
                        {new Date(joinedAt).toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  )}
                </div>

                {profileError && (
                  <p className="profile-note text-danger" role="alert">
                    {profileError}
                  </p>
                )}
                <h3>Leave shared archive</h3>
                <div className="leave-archive-card">
                  <RowLead
                    icon={<LogOut size={16} />}
                    label="Leave this archive"
                    hint={
                      members.length <= 1
                        ? "Nobody to leave it to — you are the only member"
                        : "Your access ends, but the notes stay for the other members"
                    }
                  />
                  <button
                    type="button"
                    className={leaveConfirm ? "is-danger-confirm" : ""}
                    disabled={leaveBusy || members.length <= 1}
                    onClick={() => void leaveArchive()}
                  >
                    <LogOut size={16} />
                    {leaveBusy ? "Leaving…" : leaveConfirm ? "Confirm leave" : "Leave archive"}
                  </button>
                </div>
                {leaveStatus && (
                  <p className="profile-note" role="status">
                    {leaveStatus}
                  </p>
                )}
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
                        <Palette size={16} />,
                      ],
                      [
                        "Background",
                        "background",
                        "The colour every surface is mixed from",
                        <Type size={16} />,
                      ],
                      ["Foreground", "foreground", "Text colour", <Type size={16} />],
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
                      icon={<Layers size={16} />}
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
                    icon={<Contrast size={16} />}
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
                      icon={<Image size={16} />}
                      label="Background image"
                      hint="Kept with your account, so every browser opens to it"
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
                        <ImagePlus size={16} /> Choose
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
                        icon={<Contrast size={16} />}
                        label="Darken image"
                        min={0}
                        max={80}
                        value={appearance.wallpaperDim}
                        readout={`${appearance.wallpaperDim}%`}
                        onChange={(wallpaperDim) => setAppearance({ ...appearance, wallpaperDim })}
                      />
                      <AppearanceSlider
                        icon={<Layers size={16} />}
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
                  <ChevronRight size={16} />
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

            {section === "writing" && (
              <section>
                <h3>Writing</h3>
                <div className="appearance-controls">
                  <label className="appearance-row">
                    <RowLead
                      icon={<SpellCheck size={16} />}
                      label="Proofreading"
                      hint="Offer spelling and grammar corrections on this device"
                    />
                    <input
                      type="checkbox"
                      role="switch"
                      checked={proofreaderEnabled}
                      onChange={(event) => onProofreaderEnabledChange(event.target.checked)}
                    />
                  </label>
                </div>

                <h3>Live presence</h3>
                <p className="writing-help">
                  Choose the colour used for collaborators’ names while they are in the note with
                  you.
                </p>
                <div
                  className="presence-palette-picker"
                  role="radiogroup"
                  aria-label="Live presence palette"
                >
                  {PRESENCE_PALETTES.map((palette) => (
                    <button
                      key={palette.id}
                      type="button"
                      role="radio"
                      aria-checked={writingPreferences.presencePalette === palette.id}
                      className={
                        writingPreferences.presencePalette === palette.id ? "is-active" : ""
                      }
                      onClick={() =>
                        onWritingPreferencesChange({
                          ...writingPreferences,
                          presencePalette: palette.id,
                        })
                      }
                    >
                      <i style={{ background: palette.color }} aria-hidden="true" />
                      {palette.name}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* The keys, where somebody looking for a setting will find them.
                The same list the `?` sheet shows, from the same place — two
                copies of this would be one copy and one lie. */}
            {section === "shortcuts" && (
              <section>
                {shortcutGroups().map((group) => (
                  <Fragment key={group}>
                    <h3>{group}</h3>
                    <div className="appearance-controls">
                      {SHORTCUTS.filter((entry) => entry.group === group).map((entry) => (
                        <div key={`${entry.keys}-${entry.what}`} className="appearance-row">
                          <span className="settings-label">
                            <b>{entry.what}</b>
                          </span>
                          <kbd className="settings-key">{entry.keys}</kbd>
                        </div>
                      ))}
                    </div>
                  </Fragment>
                ))}
              </section>
            )}

            {section === "security" && (
              <section>
                <h3>Security</h3>
                <dl className="settings-facts">
                  <div>
                    <span className="settings-lead" aria-hidden="true">
                      <ShieldCheck size={16} />
                    </span>
                    <span className="settings-label">
                      <dt>Storage</dt>
                      <dd>Protected by your account</dd>
                    </span>
                  </div>
                  <div>
                    <span className="settings-lead" aria-hidden="true">
                      <BookOpen size={16} />
                    </span>
                    <span className="settings-label">
                      <dt>Reading</dt>
                      <dd>{reading}</dd>
                    </span>
                  </div>
                </dl>
                <h3>Signing out</h3>
                <div className="appearance-controls">
                  <div className="appearance-row">
                    <RowLead
                      icon={<Timer size={16} />}
                      label="Sign out when idle"
                      hint="Require the account password again after a period of inactivity"
                    />
                  </div>
                  <div className="appearance-row is-stacked">
                    <Segmented
                      label="Sign out when idle"
                      value={String(autoLock)}
                      options={AUTO_LOCK_CHOICES.map((minutes) => ({
                        id: String(minutes),
                        name: AUTO_LOCK_LABELS[minutes],
                      }))}
                      onChange={(id) => onAutoLockChange(Number(id) as AutoLockMinutes)}
                    />
                  </div>
                </div>

                <h3>Privacy</h3>
                <div className="appearance-controls">
                  {/* Two switches, and they are not two halves of one thing.
                      This one is the archive-wide roster: the mark on a face
                      that says somebody is here at all. It is mutual, because
                      the channel is joined only while publishing. */}
                  <label className="appearance-row">
                    <RowLead
                      icon={<Users size={16} />}
                      label="Show me in the roster"
                      hint="Others see you are here, and you see who else is"
                    />
                    <input
                      type="checkbox"
                      role="switch"
                      checked={presenceEnabled}
                      onChange={(event) => onPresenceEnabledChange(event.target.checked)}
                    />
                  </label>

                  {/* And this one is the note you have open. Being on a note
                      both of you may write is not a disclosure, so it is on by
                      default and it is about what you are shown rather than
                      about what you give away. */}
                  <label className="appearance-row">
                    <RowLead
                      icon={<MousePointer2 size={16} />}
                      label="Collaborators in notes"
                      hint="Show who else has this note open, and their cursor"
                    />
                    <input
                      type="checkbox"
                      role="switch"
                      checked={collaboratorsVisible}
                      onChange={(event) => onCollaboratorsVisibleChange(event.target.checked)}
                    />
                  </label>

                  {/* The one row here that is not a preference. Postgres reads
                      this column back when the other member's client asks for
                      notes, so switching it on withholds the rows rather than
                      hiding them after they arrive. */}
                  <label className="appearance-row">
                    <RowLead
                      icon={<Archive size={16} />}
                      label="Keep archived notes private"
                      hint="Archived notes stay visible only to you"
                    />
                    <input
                      type="checkbox"
                      role="switch"
                      checked={profile.hideArchived}
                      onChange={(event) => onHideArchivedChange(event.target.checked)}
                    />
                  </label>
                </div>
              </section>
            )}

            {section === "members" && (
              <section>
                <h3>Seats</h3>
                <dl className="settings-facts">
                  <div>
                    <span className="settings-lead" aria-hidden="true">
                      <Users size={16} />
                    </span>
                    <span className="settings-label">
                      <dt>Occupied</dt>
                      <dd>
                        {seatsTaken} of {seatLimit}
                        {invites.length > 0 && ` · ${invites.length} waiting to be claimed`}
                      </dd>
                    </span>
                  </div>
                </dl>

                <h3>Members</h3>
                <div className="member-role-list">
                  {members.map((member) => (
                    <div key={member.userId}>
                      <span>
                        <b>{member.isSelf ? "You" : member.nickname || "Member"}</b>
                        <small>Can read and write every note</small>
                      </span>
                    </div>
                  ))}
                </div>
                {/* Sharing the archive is the decision; there is no reader
                    role to pick afterwards. What one member takes back from
                    another is a note or a passage, from the note itself. */}

                {invites.length > 0 && (
                  <>
                    <h3>Waiting to be claimed</h3>
                    <div className="member-role-list">
                      {invites.map((invite) => (
                        <div key={invite.id}>
                          <span>
                            <b>{invite.email}</b>
                            <small>{expiresIn(invite.expiresAt)}</small>
                          </span>
                          {canManageMembers && (
                            <button
                              type="button"
                              className="invite-withdraw"
                              disabled={inviteBusy}
                              onClick={() => void withdrawInvite(invite.id)}
                            >
                              <Undo2 size={16} />
                              Withdraw
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <h3>Invite someone</h3>
                {!canManageMembers ? (
                  <dl className="settings-facts">
                    <div>
                      <span className="settings-lead" aria-hidden="true">
                        <ShieldCheck size={16} />
                      </span>
                      <span className="settings-label">
                        <dt>Editors only</dt>
                        <dd>An editor in this archive can invite the other person.</dd>
                      </span>
                    </div>
                  </dl>
                ) : seatsFull ? (
                  <dl className="settings-facts">
                    <div>
                      <span className="settings-lead" aria-hidden="true">
                        <UserPlus size={16} />
                      </span>
                      <span className="settings-label">
                        <dt>No seat free</dt>
                        <dd>Withdraw an invitation nobody claimed and its seat comes back.</dd>
                      </span>
                    </div>
                  </dl>
                ) : (
                  <>
                    <div className="invite-form">
                      <label>
                        <span>Email address</span>
                        <input
                          type="email"
                          value={inviteEmail}
                          placeholder="person@example.com"
                          disabled={inviteBusy}
                          onChange={(event) => {
                            setInviteEmail(event.target.value);
                            setInviteLink("");
                            setInviteStatus("");
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={inviteBusy || !inviteEmail.trim()}
                        onClick={() => void createInvite()}
                      >
                        <UserPlus size={16} />
                        {inviteBusy ? "Creating…" : "Create invitation"}
                      </button>
                    </div>
                  </>
                )}

                {/* Both ways out of here carry the same one-time token, and
                    neither of them hands it to a third party: the link is
                    copied by you, and the message is composed and sent by your
                    own mail app. */}
                {inviteLink && (
                  <div className="invite-ready">
                    <div className="invite-link-row">
                      <input aria-label="Invitation link" readOnly value={inviteLink} />
                      <button
                        type="button"
                        aria-label="Copy invitation link"
                        onClick={() => {
                          void navigator.clipboard.writeText(inviteLink).then(() => {
                            setInviteStatus("Copied. The link expires in 7 days.");
                          });
                        }}
                      >
                        <Copy size={16} />
                      </button>
                    </div>
                    <a className="invite-mail" href={inviteMailto(inviteEmail, inviteLink)}>
                      <Mail size={16} />
                      Send it by email
                    </a>
                  </div>
                )}
                {inviteStatus && (
                  <p className="profile-note" role="status">
                    {inviteStatus}
                  </p>
                )}
              </section>
            )}
          </div>
        </div>
      </section>

      {cropping && (
        <AvatarCropper
          file={cropping}
          busy={profileBusy}
          onCancel={() => setCropping(null)}
          onConfirm={(crop) => {
            onAvatarPick(cropping, crop);
            setCropping(null);
          }}
        />
      )}
    </div>
  );
}
