import { useArchivePlan } from "@/lib/usePlan";
/* The archive on screen, opened from the switch at the top of the sidebar:
 * who is in it, how many seats it has, who is waiting to be let in.
 *
 * The same frame as the note, folder and person sheets, and its faces fly
 * the same way — the stack of faces on the switch is what grows into the
 * hero. Every face pushes that person's sheet; Back comes here.
 *
 * Seats are set here and nowhere else, one either way, between the people
 * already holding one and eight. The database is the boundary on both ends
 * (`archives_seat_limit_check`, `archives_seats_hold_members`); the stepper
 * stops before either refuses. Leaving is here too, at the foot, and takes
 * two presses, because the way back in is somebody else's invitation. */
import { useRef, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  LogOut,
  Minus,
  NotebookText,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from "@/components/icons";
import { Sheet } from "@/components/Sheet";
import { Invitations } from "@/components/Invitations";
import { FaceStack } from "@/components/SpaceSwitch";
import { Avatar } from "@/components/WorkspaceMenus";
import { ArchiveOptions } from "@/components/ArchiveOptions";
import type { Space } from "@/lib/spaces";
import { ARCHIVE_PRESETS, type ArchiveKind, type DocumentFeatures } from "@/lib/spaceShape";

const MAX_SEATS = 8;

const KIND_ICONS = { notes: <NotebookText size={22} />, book: <BookOpen size={22} /> };

/** Notes or a book. Two cards while the archive is being made, a segment in
 *  its sheet afterwards; the same two names either way. */
function KindPicker({
  kind,
  disabled,
  cards = false,
  canChooseBook = true,
  onChange,
}: {
  kind: ArchiveKind;
  disabled?: boolean;
  cards?: boolean;
  canChooseBook?: boolean;
  onChange: (kind: ArchiveKind) => void;
}) {
  return (
    <div
      className={cards ? "archive-kinds" : "settings-segment archive-presets"}
      role="radiogroup"
      aria-label="Type"
    >
      {ARCHIVE_PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          role="radio"
          disabled={disabled || (preset.kind === "document" && !canChooseBook)}
          title={preset.kind === "document" && !canChooseBook ? "Plus required" : undefined}
          aria-checked={kind === preset.kind}
          className={`press ${kind === preset.kind ? "is-active" : ""}`}
          onClick={() => onChange(preset.kind)}
        >
          {cards && KIND_ICONS[preset.id]}
          <span>{preset.name}</span>
        </button>
      ))}
    </div>
  );
}

export function ArchiveSheet({
  space,
  selfId,
  isDefault,
  avatarUrls,
  notes,
  words,
  invites,
  onRename,
  onSeats,
  onKind,
  onOptions,
  onCreateInvite,
  onRevokeInvite,
  onOpenPerson,
  onLeave,
  onDelete,
}: {
  space: Space;
  selfId: string;
  /** The archive an account starts with: always notes, never deleted. */
  isDefault: boolean;
  avatarUrls: Record<string, string | null>;
  /** Counted for the archive on screen only. */
  notes?: number;
  words?: number;
  invites: { id: string; email: string; expiresAt: string }[];
  onRename: (name: string) => Promise<void>;
  onSeats: (seats: number) => Promise<void>;
  onKind: (kind: ArchiveKind) => Promise<void>;
  onOptions: (features: DocumentFeatures) => Promise<void>;
  onCreateInvite: (email: string) => Promise<string>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onOpenPerson?: (userId: string) => void;
  onLeave?: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(space.name);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inviting, setInviting] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const plan = useArchivePlan(selfId, space.archiveId);
  const writable = plan?.can_write !== false && plan !== null;
  const seats = plan?.seat_limit ?? space.seatLimit;
  const configureSeats = writable && plan?.plan !== "free";
  const taken = space.members.length + invites.length;
  const alone = space.members.length <= 1;
  /* Whoever made it ends it, for everybody; leaving would keep it alive for
     the others with everything in it. Everybody else may only leave. */
  const maker = space.createdBy === selfId;
  const deletable = alone || maker;

  async function act(work: () => Promise<void>) {
    setBusy(true);
    setStatus("");
    try {
      await work();
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "That did not work");
    } finally {
      setBusy(false);
    }
  }

  function commitName() {
    const trimmed = name.trim();
    if (!trimmed) return setName(space.name);
    if (trimmed !== space.name) void act(() => onRename(trimmed));
  }

  return (
    <Sheet label={space.name} className="is-centered">
      <div className="sheet-body is-plain">
        <header className="sheet-hero">
          <span className="sheet-portrait">
            <FaceStack members={space.members} large />
          </span>
          <input
            ref={nameField}
            className="sheet-title-field"
            aria-label="Group name"
            value={name}
            maxLength={80}
            disabled={busy || !writable}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setName(space.name);
            }}
          />
          <p>
            {space.kind === "document" ? "Book" : "Notes"}
            {!writable && " · View only"}
            {notes !== undefined && ` · ${notes === 1 ? "1 note" : `${notes} notes`}`}
            {words !== undefined && ` · ${words.toLocaleString()} words`}
          </p>
        </header>

        <div className="sheet-actions">
          <button
            type="button"
            className={`press ${inviting ? "is-active" : ""}`}
            disabled={!writable}
            aria-expanded={inviting}
            onClick={() => setInviting((open) => !open)}
          >
            <UserPlus size={15} />
            Invite
          </button>
          <span className="archive-seats" role="group" aria-label="Seats">
            <button
              type="button"
              className="press"
              aria-label="One seat fewer"
              disabled={busy || !configureSeats || seats <= Math.max(1, taken)}
              onClick={() => void act(() => onSeats(seats - 1))}
            >
              <Minus size={13} />
            </button>
            <span>
              {taken} of {seats} seats
            </span>
            <button
              type="button"
              className="press"
              aria-label="One seat more"
              disabled={busy || !configureSeats || seats >= MAX_SEATS}
              onClick={() => void act(() => onSeats(seats + 1))}
            >
              <Plus size={13} />
            </button>
          </span>
          <button
            type="button"
            className="press"
            disabled={!writable}
            onClick={() => {
              nameField.current?.focus();
              nameField.current?.select();
            }}
          >
            <Pencil size={15} />
            Rename
          </button>
        </div>

        <div className="sheet-work">
          {(inviting || invites.length > 0) && (
            <div className="sheet-invitations">
              <Invitations
                invites={invites}
                seatsFull={taken >= seats}
                canManage={writable}
                onCreate={onCreateInvite}
                onRevoke={onRevokeInvite}
              />
            </div>
          )}

          <h3>Members</h3>
          <div className="archive-members">
            {space.members.map((member) => (
              <button
                key={member.userId}
                type="button"
                className="archive-member press"
                disabled={!onOpenPerson}
                onClick={() => onOpenPerson?.(member.userId)}
              >
                <Avatar
                  url={avatarUrls[member.userId] ?? null}
                  name={member.nickname}
                  email=""
                  compact
                />
                <span>{member.userId === selfId ? "You" : member.nickname || "Member"}</span>
                {member.userId === space.createdBy && <small>Maker</small>}
                {onOpenPerson && <ChevronRight size={15} />}
              </button>
            ))}
          </div>

          {/* The way back as well as the way in: nothing is lost either way,
              because a chapter is a note with a position. */}
          {!isDefault && (
            <>
              <h3>Type</h3>
              <KindPicker
                kind={space.kind}
                disabled={busy || !writable}
                canChooseBook={plan?.plan !== "free"}
                onChange={(kind) => kind !== space.kind && void act(() => onKind(kind))}
              />
            </>
          )}
          {space.kind === "document" && (
            <>
              <h3>Book</h3>
              <ArchiveOptions
                features={space.features}
                disabled={busy || !writable}
                onChange={(features) => void act(() => onOptions(features))}
              />
            </>
          )}

          {status && (
            <p role="alert" className="sheet-quiet is-failure">
              {status}
            </p>
          )}

          {onLeave && !alone && !(maker && !isDefault) && (
            <button
              type="button"
              className={`sheet-leave press ${leaving ? "is-confirm" : ""}`}
              disabled={busy}
              onClick={() => {
                if (!leaving) return setLeaving(true);
                void act(onLeave);
              }}
            >
              <LogOut size={14} />
              {leaving ? "Leave — press again" : "Leave this group"}
            </button>
          )}

          {/* Any archive but the first. Postgres refuses one somebody else is
              still in unless the caller made it, and says so. */}
          {!isDefault && (
            <button
              type="button"
              className={`sheet-leave press ${deleting ? "is-confirm" : ""}`}
              disabled={busy || !writable || !deletable}
              title={deletable ? undefined : "Only whoever made it can delete it"}
              onClick={() => {
                if (!deleting) return setDeleting(true);
                void act(onDelete);
              }}
            >
              <Trash2 size={14} />
              {deleting
                ? alone
                  ? "Delete every note in it — press again"
                  : "Delete it for everyone in it — press again"
                : alone
                  ? "Delete this group"
                  : "Delete for everyone"}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** A name and what it is for: notes, or a book. Members, seats and the
 *  book's tools are set from its own sheet once the window is open on it. */
export function NewArchiveSheet({
  onCreate,
  canCreateBook,
}: {
  canCreateBook: boolean;
  onCreate: (name: string, kind: ArchiveKind, features: DocumentFeatures) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ArchiveKind>("notes");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const chosen = ARCHIVE_PRESETS.find((one) => one.kind === kind) ?? ARCHIVE_PRESETS[0];

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setStatus("");
    try {
      await onCreate(name.trim(), kind, { ...chosen.features });
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "The group could not be made");
      setBusy(false);
    }
  }

  return (
    <Sheet label="New group" className="is-short">
      <form
        className="sheet-body is-plain new-archive"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <header className="sheet-hero">
          <span className="sheet-portrait sheet-note-glyph">{KIND_ICONS[chosen.id]}</span>
          <input
            className="sheet-title-field"
            aria-label="Name"
            value={name}
            maxLength={80}
            placeholder="New group"
            disabled={busy}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        </header>
        <div className="sheet-work">
          <KindPicker
            cards
            kind={kind}
            disabled={busy}
            canChooseBook={canCreateBook}
            onChange={setKind}
          />
          {status && (
            <p role="alert" className="sheet-quiet is-failure">
              {status}
            </p>
          )}
          <button
            type="submit"
            className="sheet-primary-action press"
            disabled={busy || !name.trim() || (kind === "document" && !canCreateBook)}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
