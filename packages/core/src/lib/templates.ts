/* Starting a note from a template.
 *
 * A template is any note in a folder named Templates (or Modelli) — a folder
 * the writer already knows how to make, fill and share, rather than a second
 * kind of thing with its own manager. Starting from one copies its title and
 * words into a new note; the template itself is never touched.
 *
 * Pure, so `node --experimental-strip-types` can test it. */
import { fold } from "./format.ts";

const TEMPLATE_FOLDERS = new Set(["templates", "template", "modelli", "modello"]);

export function isTemplateFolder(name: string): boolean {
  return TEMPLATE_FOLDERS.has(fold(name.trim()));
}
