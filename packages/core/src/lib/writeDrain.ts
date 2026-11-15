/* The decisions `drain` in Notes.tsx makes about timing, apart from the
   state they touch. Pure, so `node --experimental-strip-types` can test it. */

/* A failed write is retried on its own, backing off so a server that is down
   is not hammered — but never so slowly that a recovered connection is missed. */
export const RETRY_MIN_MS = 4000;
export const RETRY_MAX_MS = 60_000;

export function nextRetryDelay(ms: number): number {
  return Math.min(RETRY_MAX_MS, ms * 2);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits while a save is on its way. With `timeoutMs`, gives up after that
 *  long and returns whether it is still busy. */
export async function waitUntilIdle(
  busy: () => boolean,
  timeoutMs = Infinity,
  pollMs = 30,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (busy() && Date.now() < deadline) await sleep(pollMs);
  return busy();
}
