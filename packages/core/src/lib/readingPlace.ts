/* Where you were in a note.

   A long note — a research map, a reading list — is read over several
   sittings, and opening it at the top every time means scrolling back to the
   line you stopped at. So each note remembers the block that was at the top
   of the page, and how far into it, and opens there again.

   A block and a fraction of it, never pixels: the same note is a different
   height in a narrow pane, on the phone and in another letter size, and the
   paragraph you were reading is the same paragraph in all of them.

   Kept on this device. Where you are reading is a fact about the screen you
   are reading on, like a pane's width; the phone keeps its own place. */

const KEY = "napp:reading-places:v1";
/* Enough for every note anybody is in the middle of; the oldest go first. */
const KEEP = 200;

interface Place {
  block: number;
  into: number;
}

function load(): Record<string, Place> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, Place>) : {};
  } catch {
    return {};
  }
}

function blocksOf(scroller: HTMLElement): HTMLElement[] {
  const root = scroller.querySelector<HTMLElement>(".ProseMirror");
  return root ? (Array.from(root.children) as HTMLElement[]) : [];
}

/** Write down which block is at the top of the page. Near the top of the
 *  note there is nothing to remember: it opens there anyway. */
export function rememberPlace(noteId: string, scroller: HTMLElement) {
  const places = load();
  delete places[noteId];
  if (scroller.scrollTop > 80) {
    const top = scroller.getBoundingClientRect().top;
    const blocks = blocksOf(scroller);
    const block = blocks.findIndex((el) => el.getBoundingClientRect().bottom > top + 1);
    if (block >= 0) {
      const box = blocks[block].getBoundingClientRect();
      places[noteId] = {
        block,
        into: box.height ? Math.max(0, Math.min(1, (top - box.top) / box.height)) : 0,
      };
    }
  }
  const ids = Object.keys(places);
  for (const id of ids.slice(0, Math.max(0, ids.length - KEEP))) delete places[id];
  try {
    localStorage.setItem(KEY, JSON.stringify(places));
  } catch {
    /* A full or refused store loses a convenience, not a note. */
  }
}

/** Put the page back where it was, once the words have arrived — they come
 *  from the document after the page is drawn. Gives up if anything else has
 *  moved the page first (a link to a passage, a search hit, the reader), or
 *  if the words never get that far. Returns a cancel. */
export function restorePlace(noteId: string, scroller: HTMLElement): () => void {
  const place = load()[noteId];
  if (!place) return () => {};
  let done = false;
  const tryNow = () => {
    if (done) return;
    if (scroller.scrollTop > 2) return stop();
    const target = blocksOf(scroller)[place.block];
    if (!target) return;
    const box = target.getBoundingClientRect();
    const top = scroller.getBoundingClientRect().top;
    scroller.scrollTo({
      top: scroller.scrollTop + box.top - top + box.height * place.into,
      behavior: "instant",
    });
    stop();
  };
  const watch = new MutationObserver(tryNow);
  watch.observe(scroller, { childList: true, subtree: true });
  const giveUp = window.setTimeout(stop, 4000);
  function stop() {
    done = true;
    watch.disconnect();
    window.clearTimeout(giveUp);
  }
  tryNow();
  return stop;
}
