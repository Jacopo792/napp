/* Comments against an in-memory archive, so the panel can be opened, written
   in and resolved with no credentials and no network. Threads live for as long
   as the tab, like everything else in the preview. */
import { PREVIEW_LANDSCAPE, PREVIEW_PORTRAIT } from "./chatMedia.fixture";
import type { AppSession } from "./session.mock";
import { FIXTURE_NOTES, PREVIEW_ARCHIVE, PREVIEW_U1, PREVIEW_U2 } from "./fixture";
import type {
  ArchiveComment,
  ChatMedia,
  NoteComment,
  NoteRef,
  Reaction,
} from "@/lib/commentThreads";

export {
  notesWithOpenRemarks,
  threadsOf,
  unreadRemarks,
} from "@/lib/commentThreads";
export type {
  ArchiveComment,
  ChatMedia,
  NoteComment,
  NoteRef,
  CommentThread,
  Reaction,
} from "@/lib/commentThreads";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** Keyed by note; `null` is the archive's general chat. */
const store = new Map<string | null, NoteComment[]>();
/* Which archive a note's remarks belong to, the way `note_comments` carries an
   `archive_id`: the archive-wide read must not count another archive's. */
const archiveOf = new Map<string | null, string>([[FIXTURE_NOTES[0].id, PREVIEW_ARCHIVE]]);

/** One conversation, on the first note in the fixture and there from the
 *  start — so both readers of this store have something to show: the panel
 *  beside that note, and the archive-wide count in the rail. */
function seed(noteId: string): void {
  if (store.has(noteId)) return;
  const threadId = "seed-thread-0000-0000-000000000000";
  store.set(noteId, [
    {
      id: "seed-1",
      threadId,
      authorId: PREVIEW_U2,
      body: "@Preview questo passaggio mi convince poco — lo rivediamo?",
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
      resolvedAt: null,
      mentions: [PREVIEW_U1],
      assigneeId: PREVIEW_U1,
      bubble: "frog",
    },
    {
      id: "seed-2",
      threadId,
      authorId: PREVIEW_U1,
      body: "D'accordo. Provo a riscriverlo più corto.",
      createdAt: new Date(Date.now() - 1_800_000).toISOString(),
      resolvedAt: null,
      mentions: [],
      assigneeId: PREVIEW_U1,
      bubble: "cat",
    },
  ]);
}

seed(FIXTURE_NOTES[0].id);

/* The archive's general chat, about no note. */
store.set(null, [
  {
    id: "general-1",
    threadId: PREVIEW_ARCHIVE,
    authorId: PREVIEW_U2,
    body: "Stasera ci vediamo per rivedere tutto? 🙌",
    createdAt: new Date(Date.now() - 5_400_000).toISOString(),
    resolvedAt: null,
    mentions: [],
    assigneeId: null,
    bubble: "frog",
  },
  {
    id: "general-2",
    threadId: PREVIEW_ARCHIVE,
    authorId: PREVIEW_U2,
    body: "",
    createdAt: new Date(Date.now() - 5_300_000).toISOString(),
    resolvedAt: null,
    mentions: [],
    assigneeId: null,
    bubble: "frog",
    attachments: [
      { path: `${PREVIEW_ARCHIVE}/general-2.0.jpg`, kind: "image", width: 640, height: 480 },
    ],
  },
  {
    id: "general-3",
    threadId: PREVIEW_ARCHIVE,
    authorId: PREVIEW_U2,
    body: "Il posto per sabato, e gli appunti 📒",
    createdAt: new Date(Date.now() - 5_200_000).toISOString(),
    resolvedAt: null,
    mentions: [],
    assigneeId: null,
    bubble: "frog",
    attachments: [
      { path: `${PREVIEW_ARCHIVE}/general-3.0.jpg`, kind: "image", width: 640, height: 480 },
      { path: `${PREVIEW_ARCHIVE}/general-3.1.jpg`, kind: "image", width: 480, height: 640 },
    ],
  },
]);
archiveOf.set(null, PREVIEW_ARCHIVE);

/* The other member, so a message can be seen arriving: a reply a moment after
   each one you send, in her bubble. `subscribeToComments` in the sync stand-in
   listens here, the way Realtime would announce the insert. */
export const chatListeners = new Set<() => void>();
const ANSWERS = ["Ok!", "Ci penso io 🙌", "Sì, mi piace.", "Ne parliamo stasera?", "👀"];
let answered = 0;
function answerLater(noteId: string | null, threadId: string): void {
  window.setTimeout(() => {
    store.set(noteId, [
      ...(store.get(noteId) ?? []),
      {
        id: crypto.randomUUID(),
        threadId,
        authorId: PREVIEW_U2,
        body: ANSWERS[answered++ % ANSWERS.length]!,
        createdAt: new Date().toISOString(),
        resolvedAt: null,
        mentions: [],
        assigneeId: null,
        bubble: "frog",
      },
    ]);
    chatListeners.forEach((listener) => listener());
  }, 2600);
}

export async function loadComments(
  _session: AppSession,
  noteId: string | null,
): Promise<NoteComment[]> {
  await sleep(120);
  return [...(store.get(noteId) ?? [])];
}

export async function loadThreadIds(_session: AppSession, noteId: string): Promise<Set<string>> {
  await sleep(60);
  return new Set((store.get(noteId) ?? []).map((row) => row.threadId));
}

export async function addComment(
  session: AppSession,
  noteId: string | null,
  threadId: string,
  body: string,
  mentions: string[] = [],
  assigneeId: string | null = null,
  bubble: string | null = null,
  replyTo: string | null = null,
  refs: NoteRef[] = [],
  media?: { id: string; attachments: ChatMedia[] },
): Promise<NoteComment> {
  await sleep(140);
  const saved: NoteComment = {
    id: media?.id ?? crypto.randomUUID(),
    attachments: media?.attachments ?? [],
    threadId,
    authorId: session.userId,
    body: body.trim(),
    createdAt: new Date().toISOString(),
    resolvedAt: null,
    mentions,
    assigneeId,
    bubble,
    replyTo,
    refs,
  };
  store.set(noteId, [...(store.get(noteId) ?? []), saved]);
  archiveOf.set(noteId, session.archiveId);
  answerLater(noteId, threadId);
  return saved;
}

export async function resolveThread(
  _session: AppSession,
  noteId: string,
  threadId: string,
  resolved: boolean,
): Promise<void> {
  await sleep(100);
  const at = resolved ? new Date().toISOString() : null;
  store.set(
    noteId,
    (store.get(noteId) ?? []).map((c) => (c.threadId === threadId ? { ...c, resolvedAt: at } : c)),
  );
}

export async function deleteComment(_session: AppSession, commentId: string): Promise<void> {
  await sleep(100);
  for (const [noteId, rows] of store)
    store.set(
      noteId,
      rows.filter((c) => c.id !== commentId),
    );
}

export async function updateComment(
  session: AppSession,
  commentId: string,
  body: string,
  mentions: string[],
): Promise<NoteComment> {
  await sleep(100);
  for (const [noteId, rows] of store) {
    const found = rows.find(
      (comment) => comment.id === commentId && comment.authorId === session.userId,
    );
    if (!found) continue;
    const saved = { ...found, body: body.trim(), mentions };
    store.set(
      noteId,
      rows.map((comment) => (comment.id === commentId ? saved : comment)),
    );
    return saved;
  }
  throw new Error("Only the author may edit this comment");
}

/** The archive-wide read, from the same in-memory store. The seed lands on
 *  whichever note is opened first, so this is empty until one has been. */
export async function loadArchiveComments(session: AppSession): Promise<ArchiveComment[]> {
  await sleep(90);
  return [...store]
    .filter(([noteId]) => noteId !== null && archiveOf.get(noteId) === session.archiveId)
    .flatMap(([noteId, rows]) => rows.map((row) => ({ ...row, noteId: noteId! })));
}

export async function assignThread(
  _session: AppSession,
  noteId: string,
  threadId: string,
  assigneeId: string | null,
): Promise<void> {
  await sleep(100);
  store.set(
    noteId,
    (store.get(noteId) ?? []).map((c) => (c.threadId === threadId ? { ...c, assigneeId } : c)),
  );
}

let reactions: (Reaction & { noteId: string | null })[] = [
  { noteId: FIXTURE_NOTES[0].id, commentId: "seed-2", userId: PREVIEW_U2, emoji: "👍" },
];

export async function loadReactions(_session: AppSession, noteId: string | null): Promise<Reaction[]> {
  await sleep(80);
  return reactions.filter((reaction) => reaction.noteId === noteId);
}

export async function setReaction(
  session: AppSession,
  noteId: string | null,
  commentId: string,
  emoji: string,
  on: boolean,
): Promise<void> {
  await sleep(80);
  reactions = reactions.filter(
    (r) => !(r.commentId === commentId && r.userId === session.userId && r.emoji === emoji),
  );
  if (on) reactions.push({ noteId, commentId, userId: session.userId, emoji });
}

/** The general chat's messages for the unread count, as remarks on the
 *  archive. Only this archive has a general chat in the preview. */
export async function loadRecentGeneral(session: AppSession): Promise<ArchiveComment[]> {
  await sleep(90);
  if (session.archiveId !== PREVIEW_ARCHIVE) return [];
  return (store.get(null) ?? []).map((row) => ({ ...row, noteId: session.archiveId }));
}

/* Chat files, held for as long as the tab: a browser's picture by an object
   address; the phone shows what it sent from its own files. */
const mediaUrls = new Map<string, string>([
  [`${PREVIEW_ARCHIVE}/general-2.0.jpg`, PREVIEW_LANDSCAPE],
  [`${PREVIEW_ARCHIVE}/general-3.0.jpg`, PREVIEW_LANDSCAPE],
  [`${PREVIEW_ARCHIVE}/general-3.1.jpg`, PREVIEW_PORTRAIT],
]);

export const chatMediaPath = (
  session: AppSession,
  messageId: string,
  index: number,
  extension: string,
): string => `${session.archiveId}/${messageId}.${index}.${extension.toLowerCase()}`;

export async function uploadChatMedia(
  path: string,
  data: Blob | ArrayBuffer,
  _contentType: string,
): Promise<void> {
  await sleep(300);
  /* The phone sends bytes and shows what it sent from its own file. */
  if (data instanceof Blob && typeof URL.createObjectURL === "function")
    mediaUrls.set(path, URL.createObjectURL(data));
}

export async function chatMediaUrls(paths: string[]): Promise<Map<string, string>> {
  await sleep(60);
  return new Map(paths.filter((path) => mediaUrls.has(path)).map((path) => [path, mediaUrls.get(path)!]));
}

export async function emptyChatMedia(_archiveId: string): Promise<void> {}
