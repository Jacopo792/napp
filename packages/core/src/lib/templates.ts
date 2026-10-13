/* Starting a note from something: a template, or the day.
 *
 * A template is any note in a folder named Templates (or Modelli) — a folder
 * the writer already knows how to make, fill and share, rather than a second
 * kind of thing with its own manager. Starting from one copies its title and
 * words into a new note; the template itself is never touched.
 *
 * The day's note is a note titled with the date, written out the way the
 * reader's language writes it. Asking for it again the same day opens the
 * same note. A template named Daily (or Giornaliera, or Oggi) is what a new
 * one starts from.
 *
 * Pure, so `node --experimental-strip-types` can test it. */
import { fold } from "./format.ts";

const TEMPLATE_FOLDERS = new Set(["templates", "template", "modelli", "modello"]);
const DAILY_TEMPLATES = new Set(["daily", "today", "giornaliera", "oggi", "diario"]);

export function isTemplateFolder(name: string): boolean {
  return TEMPLATE_FOLDERS.has(fold(name.trim()));
}

export function isDailyTemplate(title: string): boolean {
  return DAILY_TEMPLATES.has(fold(title.trim()));
}

/** "lunedì 13 ottobre 2026", or "Monday, 13 October 2026" — capitalised,
 *  because it is a title. */
export function dailyTitle(date: Date, locale?: string): string {
  const written = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return written.charAt(0).toLocaleUpperCase(locale) + written.slice(1);
}
