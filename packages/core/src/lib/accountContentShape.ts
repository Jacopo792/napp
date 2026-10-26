export const accountContentRemovalKey = (userId: string) => `napp:removing-account:${userId}`;

/** Match the account segment, never a substring in an archive or note id. */
export function accountDocumentStores(
  names: Iterable<string | undefined>,
  userId: string,
): string[] {
  return [...names].filter((name): name is string => {
    const parts = name?.split(":");
    return Boolean(
      userId &&
      parts?.length === 5 &&
      parts[0] === "napp" &&
      parts[1] === "yjs" &&
      parts[2] &&
      parts[3] === userId &&
      parts[4],
    );
  });
}
