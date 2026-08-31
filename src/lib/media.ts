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
   these are 256px thumbnails, not the archive. ──────────────────────────── */
const stored = new Map<string, Promise<string>>();

export function storedImageUrl(
  objectId: string,
  load: (objectId: string) => Promise<Blob>,
): Promise<string> {
  let url = stored.get(objectId);
  if (!url) {
    url = load(objectId).then((blob) => URL.createObjectURL(blob));
    url.catch(() => stored.delete(objectId));
    stored.set(objectId, url);
  }
  return url;
}

export function forgetStoredImage(objectId: string): void {
  const url = stored.get(objectId);
  stored.delete(objectId);
  void url?.then(URL.revokeObjectURL, () => undefined);
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
