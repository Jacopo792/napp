import { useEffect, useState, useSyncExternalStore } from "react";

const COMPACT = "(max-width: 767px), (max-height: 520px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(COMPACT);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useIsCompact(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(COMPACT).matches,
    () => false,
  );
}

/* ── Stored pictures, resolved once ──────────────────────────────────────────
   A note photo is shown by every row that names the note and by the page
   itself, so the object URL belongs to the object rather than to whichever
   component draws it: without the cache a list of twenty notes downloads
   twenty blobs again on every remount. Kept until the picture is replaced —
   these are 256px thumbnails, not the archive.

   The map alone only survives as long as the tab. Every reload sent the whole
   catalogue's photographs and every cover back to Storage in eu-west-1, which
   from here is a fresh TLS handshake and something like a third of a second
   each, in parallel with all the others — which is what "the covers are slow"
   was. The Cache API holds the bytes between visits, so a picture is paid for
   once and afterwards costs a disk read, offline included.

   Object ids are uuids, so a name is never reused for different bytes and an
   entry only needs removing when the picture it belongs to is replaced. Like
   the IndexedDB Yjs stores, this is not cleared on sign-out; `SECURITY.md`
   records that retention as debt to settle before production. ───────────── */
const stored = new Map<string, Promise<string>>();

const CACHE = "napp:image:v1";
const keyFor = (objectId: string) => `https://napp.invalid/image/${objectId}`;

/** The Cache API needs a secure context and is absent in a few of them, and a
 *  browser may refuse to open a store at any time. Every use of it here is
 *  therefore best-effort: a miss, a throw and an unavailable cache all mean
 *  the same thing — fetch the bytes the ordinary way. */
async function imageCache(): Promise<Cache | null> {
  try {
    return typeof caches === "undefined" ? null : await caches.open(CACHE);
  } catch {
    return null;
  }
}

async function fromCacheOrLoad(
  objectId: string,
  load: (objectId: string) => Promise<Blob>,
): Promise<Blob> {
  const cache = await imageCache();
  if (cache) {
    try {
      const hit = await cache.match(keyFor(objectId));
      if (hit) return await hit.blob();
    } catch {
      /* Fall through to the network. */
    }
  }
  const blob = await load(objectId);
  if (cache) {
    /* Not awaited: the picture is already in hand, and writing it is a
       courtesy to the next visit, never something this one waits on. */
    void cache.put(keyFor(objectId), new Response(blob)).catch(() => undefined);
  }
  return blob;
}

export function storedImageUrl(
  objectId: string,
  load: (objectId: string) => Promise<Blob>,
): Promise<string> {
  let url = stored.get(objectId);
  if (!url) {
    url = fromCacheOrLoad(objectId, load).then((blob) => URL.createObjectURL(blob));
    url.catch(() => stored.delete(objectId));
    stored.set(objectId, url);
  }
  return url;
}

export function forgetStoredImage(objectId: string): void {
  const url = stored.get(objectId);
  stored.delete(objectId);
  void url?.then(URL.revokeObjectURL, () => undefined);
  void imageCache()
    .then((cache) => cache?.delete(keyFor(objectId)))
    .catch(() => undefined);
}

export function useStoredImage(
  objectId: string | null,
  load: (objectId: string) => Promise<Blob>,
): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!objectId) {
      setUrl(null);
      return;
    }
    let live = true;
    void storedImageUrl(objectId, load)
      .then((resolved) => live && setUrl(resolved))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [objectId, load]);
  return url;
}
