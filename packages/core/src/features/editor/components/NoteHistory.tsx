/* What the note used to say, and who changed it.
 *
 * A column beside the page, in the comments' place and shape: the two answer
 * neighbouring questions — what is being said about this text, and how did it
 * come to read like this — and a second panel shape would be a second thing to
 * learn.
 *
 * Each row is a stretch of somebody's writing, as the collaboration server
 * recorded it, or a moment a member named. Opening one shows what that stretch
 * changed — measured against the version before it, the same diff that put
 * the "+12 −3" on the row — or the whole version as it read. Restoring writes
 * it back through the editor, as an edit like any other, after the present
 * text has been kept as a version of its own: going back is never the way to
 * lose what you went back from.
 *
 * It loads for itself and only when opened, like the comments. */
import { generateHTML, type JSONContent } from "@tiptap/core";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, History, X } from "@/components/icons";
import { Avatar } from "@/components/WorkspaceMenus";
import { BASE_EXTENSIONS, richTextToPlainText } from "@/features/editor/lib/content";
import { textChanges, type TextChange } from "@/features/editor/lib/versionDiff";
import { loadVersionContent, loadVersions, nameVersion, type NoteVersion } from "@/lib/history";
import { formatDateTime } from "@/lib/format";
import { dateBucket } from "@/lib/listPreferences";
import type { AppSession } from "@/lib/session";
import type { CommentAuthor } from "./NoteComments";

type Body = { title: string; content: JSONContent };

interface Props {
  session: AppSession;
  noteId: string;
  canEdit: boolean;
  authors: Map<string, CommentAuthor>;
  /** A version to open straight away — arrived at from the note sheet. */
  initialOpenId?: string | null;
  /** The live note, read when a moment is named or kept before a restore. */
  current: () => Body | null;
  onRestore: (body: Body) => void;
  onClose: () => void;
}

const plain = (body: Body) => `${body.title}\n${richTextToPlainText(body.content)}`;

/* A chapter that changed one sentence is mostly unchanged text, and printing
   all of it buries the sentence. Long runs keep their ends, as context. */
const KEEP = 90;
function excerpt(changes: TextChange[]): TextChange[] {
  return changes.map(([kind, text], index) => {
    if (kind !== 0 || text.length <= KEEP * 2 + 20) return [kind, text];
    const first = index === 0;
    const last = index === changes.length - 1;
    if (first) return [0, `… ${text.slice(-KEEP)}`];
    if (last) return [0, `${text.slice(0, KEEP)} …`];
    return [0, `${text.slice(0, KEEP)} … ${text.slice(-KEEP)}`];
  });
}

export function NoteHistory({
  session,
  noteId,
  canEdit,
  authors,
  initialOpenId = null,
  current,
  onRestore,
  onClose,
}: Props) {
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [failure, setFailure] = useState("");
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [bodies, setBodies] = useState<Map<string, Body>>(() => new Map());
  const [whole, setWhole] = useState(false);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let live = true;
    loadVersions(session, noteId)
      .then((list) => live && setVersions(list))
      .catch((error: Error) => live && setFailure(error.message));
    return () => {
      live = false;
    };
  }, [session, noteId]);

  /* Arrived at from the note sheet with a version named: bring it into view
     once the list exists to scroll. */
  useEffect(() => {
    if (!versions || !initialOpenId) return;
    document
      .querySelector(".note-history .note-version.is-open")
      ?.scrollIntoView({ block: "nearest" });
  }, [versions, initialOpenId]);

  /* The one opened, and the one before it — the far side of its diff. */
  const index = versions?.findIndex((version) => version.id === openId) ?? -1;
  const opened = index >= 0 ? versions![index] : null;
  const previous = index >= 0 ? (versions![index + 1] ?? null) : null;

  useEffect(() => {
    const wanted = [opened?.id, previous?.id].filter((id): id is string => !!id && !bodies.has(id));
    if (!wanted.length) return;
    let live = true;
    Promise.all(wanted.map(async (id) => [id, await loadVersionContent(id)] as const))
      .then(
        (loaded) =>
          live &&
          setBodies((held) => {
            const next = new Map(held);
            for (const [id, body] of loaded) next.set(id, body);
            return next;
          }),
      )
      .catch((error: Error) => live && setFailure(error.message));
    return () => {
      live = false;
    };
  }, [opened?.id, previous?.id, bodies]);

  const openBody = opened ? bodies.get(opened.id) : undefined;
  const previousBody = previous ? bodies.get(previous.id) : undefined;
  const changes = useMemo(
    () =>
      openBody && previousBody ? excerpt(textChanges(plain(previousBody), plain(openBody))) : null,
    [openBody, previousBody],
  );
  const rendered = useMemo(
    () => (openBody && (whole || !previous) ? generateHTML(openBody.content, BASE_EXTENSIONS) : ""),
    [openBody, whole, previous],
  );

  const nameOf = (userId: string) =>
    userId === session.userId ? "You" : (authors.get(userId)?.name ?? "A former member");

  async function saveName() {
    const body = current();
    if (!body || !label.trim()) return;
    setBusy(true);
    try {
      const version = await nameVersion(session, noteId, label, body);
      setVersions((list) => [version, ...(list ?? [])]);
      setNaming(false);
      setLabel("");
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /* The present is kept first, and if it cannot be kept nothing is replaced. */
  async function restore() {
    const body = current();
    if (!openBody || !body || !opened) return;
    setBusy(true);
    try {
      const kept = await nameVersion(
        session,
        noteId,
        `Before restoring ${formatDateTime(opened.createdAt)}`,
        body,
      );
      setVersions((list) => [kept, ...(list ?? [])]);
      onRestore(openBody);
      setConfirming(false);
      setOpenId(null);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const groups: { label: string; versions: NoteVersion[] }[] = [];
  for (const version of versions ?? []) {
    const bucket = dateBucket(version.createdAt);
    const group = groups.at(-1);
    if (group?.label === bucket.label) group.versions.push(version);
    else groups.push({ label: bucket.label, versions: [version] });
  }

  function row(version: NoteVersion, recent: boolean) {
    const isOpen = version.id === openId;
    const stamp = recent
      ? new Date(version.createdAt).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })
      : formatDateTime(version.createdAt);
    return (
      <article key={version.id} className={`note-version ${isOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="note-version-head press"
          aria-expanded={isOpen}
          onClick={() => {
            setOpenId(isOpen ? null : version.id);
            setConfirming(false);
            setWhole(false);
          }}
        >
          <span className="note-version-faces">
            {version.authorIds.slice(0, 3).map((userId) => (
              <Avatar
                key={userId}
                url={authors.get(userId)?.avatarUrl ?? null}
                name={nameOf(userId)}
                email=""
                compact
              />
            ))}
          </span>
          <span className="note-version-text">
            {version.label && (
              <span className="note-version-label">
                <Bookmark size={12} />
                {version.label}
              </span>
            )}
            <span className="note-version-who">
              {version.authorIds.map(nameOf).join(", ") || "Somebody"}
            </span>
            <span className="note-version-meta">
              {stamp}
              {version.wordsAdded !== null && (
                <>
                  {" · "}
                  <span className="is-added">+{version.wordsAdded}</span>{" "}
                  <span className="is-removed">−{version.wordsRemoved ?? 0}</span>
                </>
              )}
            </span>
          </span>
        </button>

        {isOpen && (
          <div className="note-version-body">
            {previous && (
              <div className="note-version-switch" role="group" aria-label="Show">
                <button
                  type="button"
                  className={`press ${whole ? "" : "is-active"}`}
                  aria-pressed={!whole}
                  onClick={() => setWhole(false)}
                >
                  Changes
                </button>
                <button
                  type="button"
                  className={`press ${whole ? "is-active" : ""}`}
                  aria-pressed={whole}
                  onClick={() => setWhole(true)}
                >
                  Whole version
                </button>
              </div>
            )}

            {!openBody || (previous && !whole && !changes) ? (
              <p className="note-comments-empty">Loading…</p>
            ) : previous && !whole ? (
              <p className="note-version-diff">
                {changes!.every(([kind]) => kind === 0)
                  ? "No change to the words."
                  : changes!.map(([kind, text], at) =>
                      kind === 1 ? (
                        <ins key={at}>{text}</ins>
                      ) : kind === -1 ? (
                        <del key={at}>{text}</del>
                      ) : (
                        <span key={at}>{text}</span>
                      ),
                    )}
              </p>
            ) : (
              <div className="note-version-page rich-text-content">
                <h3>{openBody.title || "Untitled"}</h3>
                <div dangerouslySetInnerHTML={{ __html: rendered }} />
              </div>
            )}

            {canEdit && openBody && (
              <button
                type="button"
                className={`note-version-restore press ${confirming ? "is-confirming" : ""}`}
                disabled={busy}
                onClick={() => (confirming ? void restore() : setConfirming(true))}
              >
                {confirming ? "Yes, restore this version" : "Restore this version"}
              </button>
            )}
          </div>
        )}
      </article>
    );
  }

  return (
    <aside className="note-comments note-history" aria-label="History of this note">
      <header className="note-comments-header">
        <History size={16} />
        <span className="note-comments-title">History</span>
        <button
          type="button"
          className="note-comment-action press"
          aria-label="Close history"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>

      {canEdit && (
        <div className="note-history-name">
          {naming ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void saveName();
              }}
            >
              <input
                autoFocus
                value={label}
                maxLength={80}
                placeholder="Sent to the supervisor"
                aria-label="Version name"
                onChange={(event) => setLabel(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && setNaming(false)}
              />
              <button type="submit" className="press" disabled={busy || !label.trim()}>
                Save
              </button>
            </form>
          ) : (
            <button type="button" className="press" onClick={() => setNaming(true)}>
              <Bookmark size={14} />
              Name this version
            </button>
          )}
        </div>
      )}

      {failure && (
        <p role="alert" className="note-comments-failure">
          {failure}
        </p>
      )}

      <div className="note-comments-scroll">
        {!versions && !failure && <p className="note-comments-empty">Loading…</p>}
        {versions?.length === 0 && <p className="note-comments-empty">No versions yet.</p>}
        {groups.map((group) => (
          <section key={group.label} className="note-version-group">
            <p className="note-version-day">{group.label}</p>
            {group.versions.map((version) =>
              row(version, group.label === "Today" || group.label === "Yesterday"),
            )}
          </section>
        ))}
      </div>
    </aside>
  );
}
