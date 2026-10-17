import type { VersionBody } from "./history";

/** An unsuccessful save, a new lock or a concurrent edit must never turn a
 * restore into the loss of the current version. Both editor hosts use this. */
export async function restoreKeptVersion<T>({
  current,
  canWrite,
  keep,
  apply,
  earlier,
}: {
  current: () => VersionBody | null;
  canWrite: () => boolean;
  keep: (body: VersionBody) => Promise<T>;
  apply: (body: VersionBody) => void;
  earlier: VersionBody;
}): Promise<T> {
  if (!canWrite()) throw new Error("This note is read-only");
  const present = current();
  if (!present) throw new Error("The note is still loading");
  const saved = JSON.stringify(present);
  const kept = await keep(present);
  if (!canWrite()) throw new Error("This note became read-only");
  if (JSON.stringify(current()) !== saved)
    throw new Error("The note changed while the version was being kept. Try restoring again.");
  apply(earlier);
  return kept;
}
