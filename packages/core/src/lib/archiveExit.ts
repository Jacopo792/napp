/* Switching, leaving and deleting an archive, as a sequence apart from the
   screen. Writes waiting locally belong to the archive on screen, so they
   land first — and if they cannot, the window stays. Leaving and deleting
   end the same way: the act runs, then the window goes to another archive
   or, with none left, to the door.

   Pure, so `node --experimental-strip-types` can test it. */

export interface ArchiveExit {
  /** Waits for the save in flight, then writes what is left. */
  settle: () => Promise<void>;
  /** Whether anything is still waiting after `settle`. */
  waiting: () => boolean;
  /** Takes the window into another archive. */
  enter: (archiveId: string) => Promise<void>;
}

export interface ArchiveDeparture extends ArchiveExit {
  /** The archives the person still belongs to, after the act. */
  remaining: () => Promise<string[]>;
  clearDrafts: () => void;
  signOut: () => Promise<void>;
}

export const STILL_SAVING = "Your latest changes are still saving. Try again in a moment.";
export const NOT_SAVED = "Your latest changes could not be saved. Try again before leaving.";

async function settleOrRefuse(exit: ArchiveExit, message: string) {
  await exit.settle();
  if (exit.waiting()) throw new Error(message);
}

export async function enterArchive(from: string, to: string, exit: ArchiveExit) {
  if (from === to) return;
  await settleOrRefuse(exit, STILL_SAVING);
  await exit.enter(to);
}

/** `act` is the leave or the delete. Membership removal revokes the right to
 *  finish a write, so it runs only once nothing is waiting. */
export async function departArchive(
  from: string,
  act: () => Promise<void>,
  exit: ArchiveDeparture,
) {
  await settleOrRefuse(exit, NOT_SAVED);
  await act();
  exit.clearDrafts();
  const next = (await exit.remaining().catch(() => [])).find((id) => id !== from);
  if (next) await exit.enter(next);
  else await exit.signOut();
}
