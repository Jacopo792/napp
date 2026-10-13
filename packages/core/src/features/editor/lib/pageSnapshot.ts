/* What the Pages view lays out: the chapter copied out of the live sheet,
 * so the editor itself is never paginated. See `PageSpread.tsx`. */

export interface SheetSnapshot {
  /** The sheet's own class and inline style: its letter, its counters. */
  className: string;
  style: string;
  html: string;
}

/** The chapter, taken out of the live sheet: the title as text, the body as
 *  ProseMirror drew it (node views included), and the footnotes under it. */
export function snapshotSheet(sheet: HTMLElement, title: string): SheetSnapshot {
  const heading = document.createElement("h1");
  heading.className = "page-spread-title";
  heading.textContent = title || "Untitled";
  const body = sheet.querySelector(".rich-text-content")?.cloneNode(true) as HTMLElement | null;
  body?.removeAttribute("contenteditable");
  body
    ?.querySelectorAll("[contenteditable]")
    .forEach((node) => node.removeAttribute("contenteditable"));
  const notes = sheet.querySelector(".sheet-footnotes")?.outerHTML ?? "";
  return {
    className: sheet.className,
    style: sheet.getAttribute("style") ?? "",
    html: heading.outerHTML + (body?.outerHTML ?? "") + notes,
  };
}
