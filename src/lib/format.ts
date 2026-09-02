/** Collapse a note's searchable plain text into one readable preview line. */
export function previewOf(body: string): string {
  return body.replace(/\s+/g, " ").trim();
}

/** Relative where relative is useful, absolute the moment it stops being. */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((startOfToday.getTime() - d.getTime()) / 86_400_000);

  if (d >= startOfToday) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (diffDays < 1) return "Yesterday";
  if (diffDays < 6) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" });
}

/** The whole stamp, always the same shape. `formatStamp` is shorthand for a
 *  list, where every row is the same kind of thing and today's rows only have
 *  to be told apart from each other; the head of a note is the one place the
 *  date is read on its own, so it says the date. */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "long",
    ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}
