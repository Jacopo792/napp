/** Origins are compared literally at the handshake, including custom schemes.
 * URL.origin cannot validate app://notes: it deliberately returns "null". */
export function parseAllowedOrigins(value: string): string[] {
  const origins = [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
  if (!origins.length) throw new Error("ALLOWED_ORIGINS must contain at least one origin");
  for (const origin of origins) {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error("ALLOWED_ORIGINS contains an invalid origin");
    }
    if (
      !["http:", "https:", "app:", "capacitor:"].includes(url.protocol) ||
      !url.hostname ||
      url.hostname.includes("*") ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      origin !== `${url.protocol}//${url.host}`
    )
      throw new Error(
        "ALLOWED_ORIGINS must use exact origins without paths, credentials or wildcards",
      );
  }
  return origins;
}

export function deploymentRevision(value: string | undefined): string | null {
  if (!value) return null;
  if (!/^[a-f\d]{40}$/i.test(value))
    throw new Error("Deployment revision must be a full Git commit SHA");
  return value.toLowerCase();
}
