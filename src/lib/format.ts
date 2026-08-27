/** Markdown stripped down to something readable in a list preview. */
export function previewOf(body: string): string {
  return body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

export function countWords(s: string): number {
  const t = s.replace(/!\[[^\]]*\]\([^)]*\)/g, " ").trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Embedded image payloads are storage, not readable note characters. */
export function countChars(s: string): number {
  return s.replace(/!\[[^\]]*\]\([^)]*\)/g, "").length;
}

/** Counts are printed with a thin space grouping so four figures stay scannable. */
export function formatCount(n: number): string {
  return n.toLocaleString(undefined);
}
