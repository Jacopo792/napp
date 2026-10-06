/* The references a document makes to itself — footnotes, numbered captions,
 * and the cross-references that point at them and at its headings — counted
 * the way the sheet's stylesheet counts them.
 *
 * Word keeps a field per number and asks you to update the fields. Here
 * nothing is written down: the page draws a number with a CSS counter
 * started from `sheetCounters()`, and every other reader — the footnote list
 * under the chapter, a cross-reference's words, the picker, ⌘K — asks
 * `countTargets()`. One count, two drawings, so they cannot disagree.
 *
 * Pure, so `node --experimental-strip-types` can test it. */
import type { JSONContent } from "@tiptap/core";
import { headingNumbers } from "./manuscript.ts";

export type CaptionKind = "figure" | "table";
export type TargetKind = "section" | CaptionKind | "footnote";

/** Something a cross-reference can point at, in document order. `id` is
 *  null until somebody cites it — a heading carries `anchor`, a caption and
 *  a footnote carry `id`. */
export interface Target {
  kind: TargetKind;
  id: string | null;
  text: string;
  /** A heading's level; absent on everything else. */
  level?: number;
}

/** A cross-reference as written in a document: the id it wants, the chapter
 *  it was made against, and the target's words when it was made — what an
 *  un-cited heading in another chapter is found by until it is given the id. */
export interface ReferenceUse {
  target: string;
  noteId: string;
  kind: TargetKind;
  match: string;
}

export interface ChapterTargets {
  targets: Target[];
  references: ReferenceUse[];
}

export const EMPTY_TARGETS: ChapterTargets = { targets: [], references: [] };

const TARGET_KINDS: readonly TargetKind[] = ["section", "figure", "table", "footnote"];

export const captionKind = (value: unknown): CaptionKind =>
  value === "table" ? "table" : "figure";

export const targetKind = (value: unknown): TargetKind =>
  TARGET_KINDS.includes(value as TargetKind) ? (value as TargetKind) : "section";

function textOf(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  return (node.content ?? []).map(textOf).join("");
}

const stringOr = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null;

/** What a chapter can be cited by, and what it cites. A heading with no
 *  words is skipped, as the contents skip it; a footnote inside a heading
 *  or a caption comes after it, which is where the sheet's counter meets it. */
export function targetsOf(document: JSONContent | null | undefined): ChapterTargets {
  if (!document) return EMPTY_TARGETS;
  const targets: Target[] = [];
  const references: ReferenceUse[] = [];
  const walk = (node: JSONContent) => {
    const attrs = node.attrs ?? {};
    if (node.type === "heading") {
      const text = textOf(node).trim();
      if (text)
        targets.push({
          kind: "section",
          id: stringOr(attrs.anchor),
          text,
          level: Number(attrs.level) || 1,
        });
    }
    if (node.type === "caption")
      targets.push({ kind: captionKind(attrs.kind), id: stringOr(attrs.id), text: textOf(node) });
    if (node.type === "footnote") {
      targets.push({
        kind: "footnote",
        id: stringOr(attrs.id),
        text: typeof attrs.text === "string" ? attrs.text : "",
      });
      return;
    }
    if (node.type === "crossReference") {
      const target = stringOr(attrs.target);
      if (target)
        references.push({
          target,
          noteId: stringOr(attrs.noteId) ?? "",
          kind: targetKind(attrs.kind),
          match: typeof attrs.match === "string" ? attrs.match : "",
        });
      return;
    }
    node.content?.forEach(walk);
  };
  walk(document);
  return { targets, references };
}

/* ── Counting ───────────────────────────────────────────────────────────── */

export type FootnoteNumbering = "chapter" | "document";
export type ReferenceLanguage = "it" | "en";
export type CaptionSeparator = "period" | "colon" | "dash";

export interface ReferenceSettings {
  /** The document numbers its chapters' headings: captions are 2.1, 2.2. */
  numbered: boolean;
  footnotes: FootnoteNumbering;
  language: ReferenceLanguage;
}

export interface ReferenceChapter {
  id: string;
  title: string;
  /** Its place among the chapters; null for a page of the notebook. */
  number: number | null;
  targets: ChapterTargets;
}

export interface CountedTarget extends Target {
  noteId: string;
  chapterTitle: string;
  chapterNumber: number | null;
  /** Its place among the targets of its kind in its chapter, from 0. */
  index: number;
  /** What the page draws beside it: "2.1", "4". Null for a heading in a
   *  document that does not number them. */
  number: string | null;
}

export interface SheetStarts {
  footnote: number;
  figure: number;
  table: number;
}

export interface CountedChapter {
  starts: SheetStarts;
  targets: CountedTarget[];
}

/** Every target of every chapter with the number the page gives it, in
 *  structure order. Captions run on through the document unless it numbers
 *  by chapter (2.1, 2.2); footnotes start again in each chapter unless the
 *  document asks for one run, as Word's "Continuous" does. A notebook page
 *  is counted on its own, from 1. */
export function countTargets(
  chapters: ReferenceChapter[],
  settings: Pick<ReferenceSettings, "numbered" | "footnotes">,
): Map<string, CountedChapter> {
  const counted = new Map<string, CountedChapter>();
  const run: SheetStarts = { footnote: 0, figure: 0, table: 0 };
  for (const chapter of chapters) {
    const inRun = chapter.number !== null;
    const byChapter = settings.numbered && inRun;
    const starts: SheetStarts = {
      footnote: inRun && settings.footnotes === "document" ? run.footnote : 0,
      figure: inRun && !byChapter ? run.figure : 0,
      table: inRun && !byChapter ? run.table : 0,
    };
    const seen: Record<TargetKind, number> = { section: 0, figure: 0, table: 0, footnote: 0 };
    const sections = chapter.targets.targets.filter((target) => target.kind === "section");
    const sectionNumbers = byChapter
      ? headingNumbers(
          chapter.number as number,
          sections.map((section) => section.level ?? 1),
        )
      : [];
    const targets = chapter.targets.targets.map((target): CountedTarget => {
      const index = seen[target.kind]++;
      const number =
        target.kind === "section"
          ? (sectionNumbers[index] ?? null)
          : target.kind === "footnote"
            ? String(starts.footnote + index + 1)
            : byChapter
              ? `${chapter.number}.${index + 1}`
              : String(starts[target.kind] + index + 1);
      return {
        ...target,
        noteId: chapter.id,
        chapterTitle: chapter.title,
        chapterNumber: chapter.number,
        index,
        number,
      };
    });
    if (inRun) {
      run.footnote += seen.footnote;
      run.figure += seen.figure;
      run.table += seen.table;
    }
    counted.set(chapter.id, { starts, targets });
  }
  return counted;
}

/** The counters a chapter's sheet starts from — what `counter-reset` is
 *  given, so the first footnote on the sheet draws `starts.footnote + 1`. */
export function sheetCounters(counted: Map<string, CountedChapter>, noteId: string): SheetStarts {
  return counted.get(noteId)?.starts ?? { footnote: 0, figure: 0, table: 0 };
}

/* ── Words ──────────────────────────────────────────────────────────────── */

/** The words a reference prints, in the language the document is written in
 *  — they are part of the text, not of the interface around it. */
export const REFERENCE_WORDS = {
  it: {
    figure: "Figura",
    table: "Tabella",
    section: "sezione",
    footnote: "nota",
    chapter: "cap.",
    of: "del",
    missing: "riferimento mancante",
    quote: (text: string) => `«${text}»`,
  },
  en: {
    figure: "Figure",
    table: "Table",
    section: "section",
    footnote: "note",
    chapter: "ch.",
    of: "in",
    missing: "missing reference",
    quote: (text: string) => `“${text}”`,
  },
} as const;

export const CAPTION_SEPARATORS: Record<CaptionSeparator, string> = {
  period: ". ",
  colon: ": ",
  dash: " — ",
};

/** "sezione 2.1", "Figura 3.2", "nota 4" — and "nota 4 del cap. 2" when the
 *  note is in another chapter and its number starts again in every one,
 *  because "nota 4" alone would then name a note in each. A heading in a
 *  document that does not number them is cited by its words. */
export function referenceText(
  target: CountedTarget,
  from: string,
  settings: Pick<ReferenceSettings, "footnotes" | "language">,
): string {
  const words = REFERENCE_WORDS[settings.language];
  if (target.kind === "section")
    return target.number ? `${words.section} ${target.number}` : words.quote(target.text);
  if (target.kind === "footnote") {
    const elsewhere =
      settings.footnotes === "chapter" && target.noteId !== from && target.chapterNumber !== null;
    return `${words.footnote} ${target.number}${
      elsewhere ? ` ${words.of} ${words.chapter} ${target.chapterNumber}` : ""
    }`;
  }
  return `${words[target.kind]} ${target.number}`;
}

/* ── Resolving ──────────────────────────────────────────────────────────── */

/** What a cross-reference points at now: by its id, in the chapter it was
 *  made against and then anywhere (a target moved to another chapter is the
 *  same target); failing that, an un-cited target of the same kind with the
 *  same words in that chapter — a heading in a chapter that was not open
 *  when it was cited, until that chapter is opened and gives it the id. */
export function resolveReference(
  counted: Map<string, CountedChapter>,
  use: Pick<ReferenceUse, "target" | "noteId" | "kind" | "match">,
): CountedTarget | null {
  const own = counted.get(use.noteId)?.targets ?? [];
  const byId = (target: CountedTarget) => target.id === use.target;
  const found = own.find(byId);
  if (found) return found;
  for (const chapter of counted.values()) {
    const elsewhere = chapter.targets.find(byId);
    if (elsewhere) return elsewhere;
  }
  return (
    own.find(
      (target) => target.kind === use.kind && target.id === null && target.text === use.match,
    ) ?? null
  );
}

export interface Adoption {
  kind: TargetKind;
  match: string;
  id: string;
}

/** The ids a chapter owes the references made to it from elsewhere: each
 *  one found only by its words is given the id it was cited by, once that
 *  chapter is open in an editor that may write it. That is the moment an id
 *  is assigned — never before somebody cites the target. */
export function adoptionsFor(
  chapters: ReferenceChapter[],
  counted: Map<string, CountedChapter>,
  noteId: string,
): Adoption[] {
  const owed: Adoption[] = [];
  const given = new Set<string>();
  for (const chapter of chapters)
    for (const use of chapter.targets.references) {
      if (use.noteId !== noteId || given.has(use.target)) continue;
      const target = resolveReference(counted, use);
      if (target && target.id === null && target.noteId === noteId) {
        given.add(use.target);
        owed.push({ kind: use.kind, match: use.match, id: use.target });
      }
    }
  return owed;
}
