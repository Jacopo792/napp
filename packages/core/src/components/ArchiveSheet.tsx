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
import { useState } from "react";
import { BookOpen, LogOut, Minus, NotebookText, Plus, Trash2 } from "@/components/icons";
import { Sheet, type SheetOrigin } from "@/components/Sheet";
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
  onChange,
}: {
  kind: ArchiveKind;
  disabled?: boolean;
  cards?: boolean;
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
          disabled={disabled}
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
  origin,
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
  origin: SheetOrigin;
  space: Space;
  selfId: string;
  /** The archive an account starts with: always notes, never deleted. */
  isDefault: boolean;
  avatarUrls: Record<string, string | null>;
  notes: number;
  words: number;
  invites: { id: string; email: string; expiresAt: string }[];
  onRename: (name: string) => Promise<void>;
  onSeats: (seats: number) => Promise<void>;
  onKind: (kind: ArchiveKind) => Promise<void>;
  onOptions: (features: DocumentFeatures) => Promise<void>;
  onCreateInvite: (email: string) => Promise<string>;
  onRevokeInvite: (inviteId: string) => Promise<void>;
  onOpenPerson: (userId: string, from: Element) => void;
  onLeave: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [name, setName] = useState(space.name);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
    <Sheet label={space.name} origin={origin}>
      <div className="sheet-body">
        <header className="sheet-hero">
          <span className="sheet-portrait" data-sheet-flyer>
            <FaceStack members={space.members} large />
          </span>
          <input
            className="sheet-title-field"
            aria-label="Archive name"
            value={name}
            maxLength={80}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
            onBlur={commitName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") setName(space.name);
            }}
          />
          <p>
            {space.members.length === 1 ? "1 member" : `${space.members.length} members`}
            {" · "}
            {taken} of {space.seatLimit} seats
          </p>
        </header>

        <div className="sheet-stats">
          <div>
            <small>Notes</small>
            <strong>{notes}</strong>
          </div>
          <div>
            <small>Words</small>
            <strong>{words.toLocaleString()}</strong>
          </div>
          <div className="sheet-stepper">
            <small>Seats</small>
            <span>
              <button
                type="button"
                className="press"
                aria-label="One seat fewer"
                disabled={busy || space.seatLimit <= Math.max(1, taken)}
                onClick={() => void act(() => onSeats(space.seatLimit - 1))}
              >
                <Minus size={14} />
              </button>
              <strong>{space.seatLimit}</strong>
              <button
                type="button"
                className="press"
                aria-label="One seat more"
                disabled={busy || space.seatLimit >= MAX_SEATS}
                onClick={() => void act(() => onSeats(space.seatLimit + 1))}
              >
                <Plus size={14} />
              </button>
            </span>
          </div>
        </div>

        <div className="sheet-work">
          {/* The way back as well as the way in: nothing is lost either way,
              because a chapter is a note with a position. */}
          {!isDefault && (
            <>
              <h3>Type</h3>
              <KindPicker
                kind={space.kind}
                disabled={busy}
                onChange={(kind) => kind !== space.kind && void act(() => onKind(kind))}
              />
            </>
          )}
          {space.kind === "document" && (
            <>
              <h3>Book</h3>
              <ArchiveOptions
                features={space.features}
                disabled={busy}
                onChange={(features) => void act(() => onOptions(features))}
              />
            </>
          )}

          <h3>Members</h3>
          <div className="sheet-faces">
            {space.members.map((member) => (
              <button
                key={member.userId}
                type="button"
                className="sheet-face press"
                onClick={(event) => onOpenPerson(member.userId, event.currentTarget)}
              >
                <Avatar
                  url={avatarUrls[member.userId] ?? null}
                  name={member.nickname}
                  email=""
                  compact
                />
                {member.userId === selfId ? "You" : member.nickname || "Member"}
              </button>
            ))}
          </div>

          <div className="sheet-invitations">
            <Invitations
              invites={invites}
              seatsFull={taken >= space.seatLimit}
              canManage
              onCreate={onCreateInvite}
              onRevoke={onRevokeInvite}
            />
          </div>

          {status && (
            <p role="alert" className="sheet-quiet is-failure">
              {status}
            </p>
          )}

          {!alone && !(maker && !isDefault) && (
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
              {leaving ? "Leave — press again" : "Leave this archive"}
            </button>
          )}

          {/* Any archive but the first. Postgres refuses one somebody else is
              still in unless the caller made it, and says so. */}
          {!isDefault && (
            <button
              type="button"
              className={`sheet-leave press ${deleting ? "is-confirm" : ""}`}
              disabled={busy || !deletable}
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
                  ? "Delete this archive"
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
  origin,
  onCreate,
}: {
  origin: SheetOrigin;
  onCreate: (name: string, kind: ArchiveKind, features: DocumentFeatures) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ArchiveKind>("notes");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function create() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const preset = ARCHIVE_PRESETS.find((one) => one.kind === kind) ?? ARCHIVE_PRESETS[0];
      await onCreate(name.trim(), kind, { ...preset.features });
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "The archive could not be made");
      setBusy(false);
    }
  }

  return (
    <Sheet label="New archive" origin={origin} className="is-short">
      <form
        className="sheet-body new-archive"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <header className="sheet-hero">
          <span className="sheet-portrait sheet-note-glyph" data-sheet-flyer>
            <Plus size={30} />
          </span>
          <h2>New archive</h2>
        </header>
        <div className="sheet-work">
          <input
            className="new-archive-name"
            aria-label="Name"
            value={name}
            maxLength={80}
            placeholder="Name"
            disabled={busy}
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
          <KindPicker cards kind={kind} disabled={busy} onChange={setKind} />
          {status && (
            <p role="alert" className="sheet-quiet is-failure">
              {status}
            </p>
          )}
          <button
            type="submit"
            className="new-archive-create press"
            disabled={busy || !name.trim()}
          >
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
