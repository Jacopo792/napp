import { downloadAvatar } from "@/lib/supabase";

interface CachedAvatar {
  userId: string;
  refs: number;
  stale: boolean;
  url: string | null;
  loading: Promise<string | null>;
}

const avatars = new Map<string, CachedAvatar>();

function dispose(objectId: string, entry: CachedAvatar): void {
  if (entry.url) URL.revokeObjectURL(entry.url);
  avatars.delete(objectId);
}

/**
 * Object URLs belong to the avatar object, not to whichever component happens
 * to display it. A lease may be released on unmount without destroying the URL;
 * it is revoked only when that stored avatar is explicitly replaced or removed.
 */
export function acquireAvatarUrl(
  userId: string,
  objectId: string,
): { url: Promise<string | null>; release: () => void } {
  let entry = avatars.get(objectId);
  if (!entry) {
    const created: CachedAvatar = {
      userId,
      refs: 0,
      stale: false,
      url: null,
      loading: Promise.resolve(null),
    };
    created.loading = downloadAvatar(userId, objectId).then((blob) => {
      if (!blob || created.stale) return null;
      created.url = URL.createObjectURL(blob);
      return created.url;
    });
    avatars.set(objectId, created);
    entry = created;
  }
  entry.refs += 1;

  let released = false;
  return {
    url: entry.loading,
    release: () => {
      if (released) return;
      released = true;
      entry!.refs = Math.max(0, entry!.refs - 1);
      if (entry!.stale && entry!.refs === 0) dispose(objectId, entry!);
    },
  };
}

export function invalidateAvatarUrl(objectId: string): void {
  const entry = avatars.get(objectId);
  if (!entry) return;
  entry.stale = true;
  if (entry.refs === 0) dispose(objectId, entry);
}
