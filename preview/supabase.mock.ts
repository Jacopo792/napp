import { uuid } from "./uuid";
import { projectDocument } from "@/features/editor/lib/ydoc";
import { richTextToPlainText } from "@/features/editor/lib/content";
import type { Doc } from "yjs";
/* Preview-only stand-in for src/lib/supabase.ts. An in-memory archive built from
   the fixture, with enough latency that "Saving" and "Saved" are actually
   observable. Never bundled by vite.config.ts — only vite.preview.config.ts
   redirects to it, so the shipped app always talks to real Postgres.

   Because this file replaces the whole persistence layer, the real crypto module
   is simply never reached: nothing here encrypts, and the fixture is plaintext. */
import type { NoteEntry } from "@/lib/entries";
import type { AppSession } from "@/lib/session";
import { EMPTY_META, type Meta, type Note, type NoteMeta } from "@/lib/types";
import {
  FIXTURE_META,
  FIXTURE_NOTES,
  PARTNER_NOTES,
  PARTNER_META,
  PREVIEW_ARCHIVE,
  PREVIEW_THESIS,
  PREVIEW_U1,
  PREVIEW_U2,
  THESIS_META,
  THESIS_NOTES,
} from "./fixture";
import { spaceMembers, spaceSeats } from "./spaces.mock";

export interface ArchiveMember {
  userId: string;
  nickname: string;
  avatarObject: string | null;
  joinedAt: string;
  role: "editor" | "viewer";
  isSelf: boolean;
}

export interface Profile {
  nickname: string;
  avatarObject: string | null;
  hideArchived: boolean;
}

export interface ArchiveSnapshot {
  entries: NoteEntry[];
  members: ArchiveMember[];
  seatLimit: number;
  metas: Record<string, Meta>;
}

export interface PendingInvite {
  id: string;
  email: string;
  expiresAt: string;
}

/* No pictures to start with: the preview opens on the monograms a member
   without a photo is drawn with, which is the case the interface has to make
   look good on its own. A picture added from Settings still works. */
/* Kept on the global object, so a hot reload of this module does not forget
   a picture uploaded a minute ago while the screens still name it. */
const kept = <T>(name: string, make: () => T): T =>
  ((globalThis as Record<string, unknown>)[`__nappPreview_${name}`] ??= make()) as T;

const avatars = kept("avatars", () => new Map<string, Blob>());

const JOINED: Record<string, string> = {
  [PREVIEW_U1]: "2026-05-18T09:00:00.000Z",
  [PREVIEW_U2]: "2026-06-02T09:00:00.000Z",
};

/* The profile the preview edits, kept in memory like everything else here so
   the page can be worked on without an account. */
let profile: Profile = {
  nickname: "Preview",
  avatarObject: null,
  hideArchived: false,
};

/** sync.mock.ts replaces the realtime layer, so this only has to exist. */
export const supabase = {
  auth: {
    async getUser() {
      return { data: { user: null }, error: null };
    },
    async signOut() {
      return { error: null };
    },
  },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* One store per archive, as Postgres keeps one per `archive_id`: the fixture
   is the preview archive's, every other archive starts empty. Switching from
   the sidebar has to show that what was written in one is not in the other. */
interface ArchiveStore {
  notes: Map<string, NoteEntry>;
  metas: Record<string, Meta>;
}
const stores = kept("stores", () => new Map<string, ArchiveStore>());

function storeOf(session: AppSession): ArchiveStore {
  const existing = stores.get(session.archiveId);
  if (existing) return existing;
  const store: ArchiveStore =
    session.archiveId === PREVIEW_ARCHIVE
      ? {
          notes: new Map(
            [...FIXTURE_NOTES, ...PARTNER_NOTES].map((note) => [note.id, { note: { ...note }, version: 1 }]),
          ),
          metas: {
            [PREVIEW_U1]: structuredClone(FIXTURE_META),
            [PREVIEW_U2]: structuredClone(PARTNER_META),
          },
        }
      : session.archiveId === PREVIEW_THESIS
        ? {
            notes: new Map(
              THESIS_NOTES.map((note) => [note.id, { note: { ...note }, version: 1 }]),
            ),
            metas: {
              [PREVIEW_U1]: structuredClone(THESIS_META),
              [PREVIEW_U2]: { ...structuredClone(EMPTY_META), partnerName: "Lucile" },
            },
          }
        : { notes: new Map(), metas: { [session.userId]: structuredClone(EMPTY_META) } };
  stores.set(session.archiveId, store);
  return store;
}

function membersOf(session: AppSession): ArchiveMember[] {
  return spaceMembers(session.archiveId).map((member) => ({
    ...member,
    ...(member.userId === session.userId
      ? { nickname: profile.nickname, avatarObject: profile.avatarObject }
      : {}),
    joinedAt: JOINED[member.userId] ?? "2026-08-29T09:00:00.000Z",
    role: "editor",
    isSelf: member.userId === session.userId,
  }));
}

export async function loadArchive(session: AppSession): Promise<ArchiveSnapshot> {
  await sleep(240);
  const { notes, metas } = storeOf(session);
  return {
    entries: [...notes.values()]
      .map((entry) => ({ note: { ...entry.note }, version: entry.version }))
      .sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt)),
    // A fresh array, the way the real loader builds one: handing back the same
    // object made every roster change invisible to React.
    members: membersOf(session),
    seatLimit: spaceSeats(session.archiveId),
    metas: structuredClone(metas),
  };
}

/** The preview has one writer, so nothing ever conflicts — but the class has
 *  to exist, because the page tests every save failure against it. */
export class NoteConflict extends Error {
  constructor(readonly entry: NoteEntry | null) {
    super("This note changed somewhere else");
    this.name = "NoteConflict";
  }
}

/** What a new note was made with, for the collaboration mock to seed from —
 *  the server seeds a new document from the row in the same way. */
export const createdNotes = kept("createdNotes", () => new Map<string, Note>());

export async function createNote(
  session: AppSession,
  note: Note,
  _metadata: NoteMeta,
): Promise<NoteEntry> {
  await sleep(260);
  const entry: NoteEntry = { note: { ...note }, version: 1 };
  storeOf(session).notes.set(note.id, entry);
  createdNotes.set(note.id, note);
  return { note: { ...note }, version: 1 };
}

export async function updateNoteProperties(
  session: AppSession,
  noteId: string,
  values: Partial<Pick<Note, "photo" | "cover">>,
): Promise<void> {
  await sleep(120);
  const entry = storeOf(session).notes.get(noteId);
  if (!entry) return;
  entry.note = { ...entry.note, ...structuredClone(values) };
}

export async function saveNote(
  session: AppSession,
  note: Note,
  expectedVersion: number,
): Promise<number> {
  await sleep(420);
  const { notes } = storeOf(session);
  const current = notes.get(note.id);
  if (!current) throw new NoteConflict(null);
  // Faithful to the archive: a version that has moved is a conflict, not a
  // reason to write anyway.
  if (current.version !== expectedVersion) throw new NoteConflict({ ...current });
  const version = current.version + 1;
  notes.set(note.id, { note: { ...note }, version });
  return version;
}

export async function deleteNote(session: AppSession, noteId: string): Promise<void> {
  return deleteNotes(session, [noteId]);
}

export async function deleteNotes(session: AppSession, noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return;
  await sleep(200);
  const { notes } = storeOf(session);
  for (const id of noteIds) notes.delete(id);
}

export async function persistMetaDiff(
  session: AppSession,
  owner: string,
  _before: Meta,
  after: Meta,
): Promise<void> {
  await sleep(220);
  storeOf(session).metas[owner] = structuredClone(after);
}

/* Storage, in memory. The preview never encrypts, so an object is stored as the
   blob it arrived as and handed straight back. */
const objects = kept("objects", () => new Map<string, Blob>());

export async function uploadObject(
  _session: AppSession,
  objectId: string,
  blob: Blob,
): Promise<void> {
  await sleep(160);
  objects.set(objectId, blob);
}

export async function downloadObject(
  _session: AppSession,
  objectId: string,
  type: string,
): Promise<Blob> {
  await sleep(120);
  const stored = objects.get(objectId);
  if (!stored) throw new Error("That attachment is not in this preview archive");
  return new Blob([await stored.arrayBuffer()], { type });
}

export async function uploadObjectBytes(session: AppSession, objectId: string, data: Blob | ArrayBuffer, type = "application/octet-stream") {
  /* React Native cannot build a Blob from bytes; the phone's own copy of what
     it uploaded is already cached, so the preview only has to hold a stand-in. */
  if (!(data instanceof Blob)) {
    await sleep(160);
    objects.set(objectId, { arrayBuffer: async () => data, type } as unknown as Blob);
    return;
  }
  return uploadObject(session, objectId, data);
}
export const uploadImage = uploadObject;

export function downloadImage(session: AppSession, imageId: string): Promise<Blob> {
  return downloadObject(session, imageId, "image/webp");
}

export async function loadProfile(_session: AppSession): Promise<Profile> {
  await sleep(120);
  return { ...profile };
}

export async function saveProfile(_session: AppSession, next: Profile): Promise<void> {
  await sleep(200);
  profile = { ...next };
}

export async function uploadAvatar(
  _session: AppSession,
  file: Blob | ArrayBuffer,
  _contentType?: string,
  objectId: string = uuid(),
): Promise<string> {
  await sleep(240);
  avatars.set(objectId, file as Blob);
  return objectId;
}

export async function downloadAvatar(
  _userId: string,
  objectId: string,
): Promise<Blob | null> {
  await sleep(80);
  return avatars.get(objectId) ?? null;
}

export async function deleteAvatar(_session: AppSession, objectId: string): Promise<void> {
  await sleep(80);
  avatars.delete(objectId);
}

const invitesByArchive = new Map<string, PendingInvite[]>();

export async function createArchiveInvite(session: AppSession, email: string): Promise<string> {
  await sleep(180);
  const invites = invitesByArchive.get(session.archiveId) ?? [];
  invitesByArchive.set(session.archiveId, [
    ...invites.filter((invite) => invite.email !== email),
    {
      id: `preview-invite-${invites.length + 1}`,
      email,
      expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  ]);
  return "a".repeat(64);
}

export async function loadPendingInvites(session: AppSession): Promise<PendingInvite[]> {
  await sleep(80);
  return (invitesByArchive.get(session.archiveId) ?? []).map((invite) => ({ ...invite }));
}

export async function revokeArchiveInvite(inviteId: string): Promise<void> {
  await sleep(120);
  for (const [archiveId, invites] of invitesByArchive)
    invitesByArchive.set(
      archiveId,
      invites.filter((invite) => invite.id !== inviteId),
    );
}

/** The fixture archive is the only one there is, so leaving it is a no-op that
 *  still takes a moment — enough for the caller's confirmation to settle. */
export async function leaveArchive(_session: AppSession): Promise<void> {
  await sleep(160);
}

/** The local equivalent of the collaboration server projecting a changed document. */
export function projectPreviewNote(noteId: string, document: Doc): void {
 for (const [archiveId, store] of stores) {
  const previous = store.notes.get(noteId);
  if (!previous) continue;
  const projection = projectDocument(document);
  const body = richTextToPlainText(projection.content);
  if (previous.note.title === projection.title && JSON.stringify(previous.note.content) === JSON.stringify(projection.content)) return;
  store.notes.set(noteId, {note: {...previous.note, ...projection, body, updatedAt: new Date().toISOString()}, version: previous.version + 1});
  window.dispatchEvent?.(new CustomEvent("napp:preview-archive-changed", {detail: archiveId}));
  return;
 }
}
