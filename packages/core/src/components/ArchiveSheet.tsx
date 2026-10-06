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
import { LogOut, Minus, Plus, Trash2 } from "@/components/icons";
import { Sheet, type SheetOrigin } from "@/components/Sheet";
import { Invitations } from "@/components/Invitations";
import { FaceStack } from "@/components/SpaceSwitch";
import { Avatar } from "@/components/WorkspaceMenus";
import { ArchiveOptions } from "@/components/ArchiveOptions";
import type { Space } from "@/lib/spaces";
import { DEFAULT_FEATURES, type ArchiveKind, type DocumentFeatures } from "@/lib/spaceShape";

const MAX_SEATS = 8;

export function ArchiveSheet({
  origin,
  space,
  selfId,
  avatarUrls,
  notes,
  words,
  invites,
  onRename,
  onSeats,
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
  avatarUrls: Record<string, string | null>;
  notes: number;
  words: number;
  invites: { id: string; email: string; expiresAt: string }[];
  onRename: (name: string) => Promise<void>;
  onSeats: (seats: number) => Promise<void>;
  onOptions: (kind: ArchiveKind, features: DocumentFeatures) => Promise<void>;
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
          {/* Only a document carries options. A notes archive is the app as it
              has always been, and its sheet stays as it was. */}
          {space.kind === "document" && (
            <>
              <h3>Document</h3>
              <ArchiveOptions
                kind={space.kind}
                features={space.features}
                disabled={busy}
                onChange={(kind, features) => void act(() => onOptions(kind, features))}
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

          <button
            type="button"
            className={`sheet-leave press ${leaving ? "is-confirm" : ""}`}
            disabled={busy || alone}
            title={alone ? "You are the only member" : undefined}
            onClick={() => {
              if (!leaving) return setLeaving(true);
              void act(onLeave);
            }}
          >
            <LogOut size={14} />
            {leaving ? "Leave — press again" : "Leave this archive"}
          </button>

          {/* Where Leave cannot go, Delete can: an archive with nobody else in
              it takes nothing from anybody. Postgres says the same thing. */}
          {alone && (
            <button
              type="button"
              className={`sheet-leave press ${deleting ? "is-confirm" : ""}`}
              disabled={busy}
              onClick={() => {
                if (!deleting) return setDeleting(true);
                void act(onDelete);
              }}
            >
              <Trash2 size={14} />
              {deleting ? "Delete every note in it — press again" : "Delete this archive"}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** A name and what it is for. Members, seats and invitations are set from
 *  its own sheet once the window is open on it. */
export function NewArchiveSheet({
  origin,
  onCreate,
}: {
  origin: SheetOrigin;
  onCreate: (name: string, kind: ArchiveKind, features: DocumentFeatures) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ArchiveKind>("notes");
  const [features, setFeatures] = useState<DocumentFeatures>({ ...DEFAULT_FEATURES });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      await onCreate(name.trim(), kind, features);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "The archive could not be made");
      setBusy(false);
    }
  }

  return (
    <Sheet label="New archive" origin={origin}>
      <div className="sheet-body">
        <header className="sheet-hero">
          <span className="sheet-portrait sheet-note-glyph" data-sheet-flyer>
            <Plus size={30} />
          </span>
          <h2>New archive</h2>
        </header>
        <div className="sheet-work">
          <div className="invite-form">
            <label>
              <span>Name</span>
              <input
                value={name}
                maxLength={80}
                placeholder="Study group, Thesis…"
                disabled={busy}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && void create()}
              />
            </label>
          </div>
          <ArchiveOptions
            withPresets
            kind={kind}
            features={features}
            disabled={busy}
            onChange={(nextKind, nextFeatures) => {
              setKind(nextKind);
              setFeatures(nextFeatures);
            }}
          />
          <div className="invite-form">
            <button type="button" disabled={busy || !name.trim()} onClick={() => void create()}>
              <Plus size={16} />
              {busy ? "Making…" : "Make archive"}
            </button>
          </div>
          {status && (
            <p role="alert" className="sheet-quiet is-failure">
              {status}
            </p>
          )}
        </div>
      </div>
    </Sheet>
  );
}
