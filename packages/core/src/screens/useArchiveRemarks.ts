import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  loadArchiveComments,
  notesWithOpenRemarks,
  unreadRemarks,
  type ArchiveComment,
  type RemarksSeen,
} from "@/lib/comments";
import type { AppSession } from "@/lib/session";
import { subscribeToComments, unsubscribeFromArchive } from "@/lib/sync";

/** Every remark in the archive, which notes have open ones, and which of them
 *  somebody else wrote since this account last read them. `remarksSeen` stays
 *  with the caller, which pushes it with the account preferences. `awake`
 *  changes when the machine wakes, so a socket that died asleep is replaced. */
export function useArchiveRemarks(
  session: AppSession | null,
  remarksSeen: RemarksSeen,
  setRemarksSeen: Dispatch<SetStateAction<RemarksSeen>>,
  awake: number,
) {
  /* Remarks, archive-wide. The panel beside a note answers "what was said
     about this"; this answers the question a shared archive raises the moment
     you sign in — has the other member said anything, anywhere, since you last
     looked.

     The line is a timestamp per note, held in this browser rather than in a
     column, and deliberately: it is a fact about a device looking, not about
     the archive, and a set of read ids is a thing nobody ever finishes
     pruning. A new device therefore starts with everything unread, which is
     the right answer for it. Per note rather than archive-wide because opening
     a note is the act of having read what was said on it — one line for the
     whole archive could only be moved by looking at the list, which left the
     dot up after you had read the one remark under it. */
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const selfId = session?.userId ?? null;
  const [archiveComments, setArchiveComments] = useState<ArchiveComment[]>([]);
  const saidThreads = useMemo(
    () => new Set(archiveComments.map((comment) => comment.threadId)),
    [archiveComments],
  );
  /* Reading a note is having read its remarks. Written to the account, not to
     this browser: it is a thing the person did, and a badge that says "unread"
     for every conversation already read on the other device is a badge nobody
     can clear. The caller pushes it with the account preferences. */
  const commentsRef = useRef(archiveComments);
  commentsRef.current = archiveComments;
  const markRemarksSeen = useCallback(
    (noteId: string) => {
      /* Past the newest remark on the note as well as now: a clock running
         behind the server's would otherwise leave what was just read unread. */
      const newest = commentsRef.current
        .filter((comment) => comment.noteId === noteId)
        .reduce((latest, comment) => Math.max(latest, Date.parse(comment.createdAt) + 1), 0);
      const at = new Date(Math.max(Date.now(), newest)).toISOString();
      setRemarksSeen((current) => ({ ...current, [noteId]: at }));
    },
    [setRemarksSeen],
  );

  /* One read per burst, not one per row. Realtime announces every insert,
     update and delete on `note_comments` separately, and a resolved thread of
     six remarks is six announcements — each one re-reading every comment in
     the archive. They arrive together, so they are answered together. */
  const remarkTimer = useRef(0);
  const refreshRemarks = useCallback(() => {
    window.clearTimeout(remarkTimer.current);
    remarkTimer.current = window.setTimeout(() => {
      const current = sessionRef.current;
      if (!current) return;
      void loadArchiveComments(current)
        .then(setArchiveComments)
        /* A remark that will not load is not a reason to fail to open the
           archive: the count simply stays where it was. */
        .catch(() => undefined);
    }, 400);
  }, []);

  useEffect(() => () => window.clearTimeout(remarkTimer.current), []);

  useEffect(() => {
    if (!session) return;
    refreshRemarks();
    const channel = subscribeToComments(session.archiveId, refreshRemarks);
    return () => void unsubscribeFromArchive(channel);
    /* `awake` for the same reason the archive channel takes it: a socket that
       died while the machine slept announces nothing, and this one carries the
       badge. */
  }, [session, refreshRemarks, awake]);

  const remarkedIds = useMemo(() => notesWithOpenRemarks(archiveComments), [archiveComments]);
  const unreadRemarkNotes = useMemo(
    () =>
      new Set(
        selfId
          ? unreadRemarks(archiveComments, selfId, remarksSeen).map((remark) => remark.noteId)
          : [],
      ),
    [archiveComments, selfId, remarksSeen],
  );
  const unreadRemarkCount = useMemo(
    () => (selfId ? unreadRemarks(archiveComments, selfId, remarksSeen).length : 0),
    [archiveComments, selfId, remarksSeen],
  );
  /* The number on the icon in the Dock, which is the whole of what an
     application can say to somebody who is not looking at it.
     `navigator.setAppBadge` and not a bridge to `app.dock.setBadge`: it is a
     standard the browser has too, Electron implements it and puts it on the
     Dock, and a member on `platform.ts` for it would have been an interface
     describing a habit. Absent in a plain tab, where it simply does nothing. */
  useEffect(() => {
    const badge = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!badge.setAppBadge || !badge.clearAppBadge) return;
    void (
      unreadRemarkCount > 0 ? badge.setAppBadge(unreadRemarkCount) : badge.clearAppBadge()
    ).catch(() => undefined);
  }, [unreadRemarkCount]);

  return {
    archiveComments,
    saidThreads,
    markRemarksSeen,
    refreshRemarks,
    remarkedIds,
    unreadRemarkNotes,
    unreadRemarkCount,
  };
}
