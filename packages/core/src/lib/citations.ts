/* A document's sources and the citations made to them: read out of a
 * BibTeX file or Zotero's CSL-JSON, kept as CSL-JSON (`archive_sources`), and
 * printed in one of two styles written here rather than by citeproc — an
 * author-date style, "(Rossi 2020, p. 12)", and a numeric one, "[3, p. 12]".
 *
 * Like the cross-references, nothing is numbered on the page: a citation
 * holds its key and its locator, and its words — and the bibliography under
 * them — are worked out every time they are drawn, in the order the chapters
 * stand in now.
 *
 * Pure, so `node --experimental-strip-types` can test it. */
import { REFERENCE_WORDS, type ReferenceLanguage } from "./references.ts";

export type CitationStyle = "author-date" | "numeric";

export interface CslName {
  family?: string;
  given?: string;
  /** An institution, or a name BibTeX was told to keep whole. */
  literal?: string;
}

/** The part of a CSL-JSON item the two styles print. Anything else in an
 *  import is left behind: it would be stored and never read. */
export interface Source {
  id: string;
  type: string;
  title?: string;
  author?: CslName[];
  editor?: CslName[];
  issued?: { "date-parts": number[][] };
  "container-title"?: string;
  publisher?: string;
  "publisher-place"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
  URL?: string;
}

const TEXT_FIELDS = [
  "title",
  "container-title",
  "publisher",
  "publisher-place",
  "volume",
  "issue",
  "page",
  "DOI",
  "URL",
] as const;

/** A key pandoc can write after `@`, and Zotero's Better BibTeX writes. */
export const CITATION_KEY = /^[\p{L}\p{N}_][\p{L}\p{N}_:.#$%&+?<>~/-]*$/u;

const text = (value: unknown, max = 2000): string | undefined => {
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string") return undefined;
  const clean = value.replace(/\s+/g, " ").trim().slice(0, max);
  return clean || undefined;
};

function names(value: unknown): CslName[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const read = value
    .slice(0, 100)
    .map((raw): CslName | null => {
      if (!raw || typeof raw !== "object") return null;
      const name: CslName = {};
      const { family, given, literal } = raw as Record<string, unknown>;
      if (text(family, 200)) name.family = text(family, 200);
      if (text(given, 200)) name.given = text(given, 200);
      if (text(literal, 200)) name.literal = text(literal, 200);
      return name.family || name.literal ? name : null;
    })
    .filter((name): name is CslName => name !== null);
  return read.length ? read : undefined;
}

function year(value: unknown): number | undefined {
  const issued = value as { "date-parts"?: unknown; literal?: unknown; raw?: unknown } | null;
  const first = Array.isArray(issued?.["date-parts"]) ? issued["date-parts"][0] : undefined;
  const raw = Array.isArray(first) ? first[0] : (issued?.literal ?? issued?.raw);
  const found = /-?\d{1,4}/.exec(String(raw ?? ""));
  return found ? Number(found[0]) : undefined;
}

/** A source read rather than trusted: it comes out of a file somebody chose,
 *  or out of a row the other member wrote, and goes onto the page. */
export function readSource(raw: unknown): Source | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = text(record.id, 200);
  if (!id || !CITATION_KEY.test(id)) return null;
  const source: Source = { id, type: text(record.type, 40) ?? "document" };
  for (const field of TEXT_FIELDS) {
    const value = text(record[field]);
    if (value) source[field] = value;
  }
  const author = names(record.author);
  if (author) source.author = author;
  const editor = names(record.editor);
  if (editor) source.editor = editor;
  const issued = year(record.issued);
  if (issued !== undefined) source.issued = { "date-parts": [[issued]] };
  return source;
}

/* ── BibTeX ─────────────────────────────────────────────────────────────── */

const ACCENTS: Record<string, string> = {
  "'": "́",
  "`": "̀",
  "^": "̂",
  '"': "̈",
  "~": "̃",
  "=": "̄",
  ".": "̇",
  c: "̧",
  v: "̌",
  u: "̆",
  H: "̋",
  k: "̨",
  r: "̊",
};

const LETTERS: Record<string, string> = {
  ss: "ß",
  o: "ø",
  O: "Ø",
  ae: "æ",
  AE: "Æ",
  oe: "œ",
  OE: "Œ",
  aa: "å",
  AA: "Å",
  l: "ł",
  L: "Ł",
};

/** BibTeX's spelling of a letter, an accent and a dash, as the letter. */
export function unlatex(value: string): string {
  return value
    .replace(/\\([ij])(?![a-zA-Z])\s*/g, "$1")
    .replace(
      /\\(ss|ae|AE|oe|OE|aa|AA|o|O|l|L)(?![a-zA-Z])\s*/g,
      (_, letter: string) => LETTERS[letter],
    )
    .replace(
      /\\([`'^"~=.])\s*(?:\{\s*([a-zA-Z])\s*\}|([a-zA-Z]))/g,
      (_, accent: string, a?: string, b?: string) => `${a ?? b}${ACCENTS[accent]}`,
    )
    .replace(
      /\\([cvuHkr])(?:\s*\{\s*([a-zA-Z])\s*\}|\s+([a-zA-Z]))/g,
      (_, accent: string, a?: string, b?: string) => `${a ?? b}${ACCENTS[accent]}`,
    )
    .replace(/\\(?:textit|textbf|emph|textsc|textrm|texttt|mkbibquote|url)\s*\{/g, "{")
    .replace(/\\([&%$#_{}])/g, "$1")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/(?<!\\)~/g, " ")
    .replace(/[{}]/g, "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

/** "and" at the top level only: `{Barnes and Noble}` is one name. */
function splitNames(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
    else if (depth === 0 && /\s/.test(char)) {
      const and = /^\s+and\s+/i.exec(value.slice(i));
      if (and) {
        parts.push(value.slice(start, i));
        i += and[0].length - 1;
        start = i + 1;
      }
    }
  }
  parts.push(value.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** "Rossi, Mario", "Mario Rossi", "Ludwig van Beethoven", "{World Health
 *  Organization}" — the three shapes BibTeX writes a name in, and the braces
 *  that keep one whole. */
export function bibtexName(raw: string): CslName {
  const whole = raw.trim();
  if (/^\{[^{}]*\}$/.test(whole)) return { literal: unlatex(whole) };
  if (whole.includes(",")) {
    const [family, ...rest] = whole.split(",");
    const given = unlatex(rest.at(-1) ?? "");
    return given ? { family: unlatex(family), given } : { family: unlatex(family) };
  }
  const words = unlatex(whole).split(" ");
  if (words.length === 1) return { family: words[0] };
  /* "von", "van der", "de": the first lowercase word before the last starts
     the family name, as BibTeX reads it. */
  let at = words.length - 1;
  for (let i = 1; i < words.length - 1; i += 1)
    if (/^\p{Ll}/u.test(words[i])) {
      at = i;
      break;
    }
  return { family: words.slice(at).join(" "), given: words.slice(0, at).join(" ") };
}

const BIBTEX_TYPES: Record<string, string> = {
  article: "article-journal",
  book: "book",
  booklet: "book",
  inbook: "chapter",
  incollection: "chapter",
  inproceedings: "paper-conference",
  conference: "paper-conference",
  phdthesis: "thesis",
  mastersthesis: "thesis",
  thesis: "thesis",
  techreport: "report",
  report: "report",
  online: "webpage",
  manual: "book",
};

/** Read one braced or quoted value starting at `i`, braces kept. */
function readDelimited(src: string, i: number): [string, number] {
  const open = src[i];
  let depth = 0;
  let j = i;
  for (; j < src.length; j += 1) {
    const char = src[j];
    if (char === "\\") {
      j += 1;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (open === "{" && depth === 0) return [src.slice(i + 1, j), j + 1];
    } else if (open === '"' && char === '"' && depth === 0 && j > i)
      return [src.slice(i + 1, j), j + 1];
  }
  return [src.slice(i + 1), src.length];
}

/** Every entry in a `.bib` file. `@string` abbreviations are expanded and
 *  `#` joins; `@comment` and `@preamble` are passed over. An entry the
 *  parser cannot read is skipped rather than taking the file with it. */
export function parseBibtex(src: string): Source[] {
  const strings = new Map<string, string>();
  const sources: Source[] = [];
  const at = /@\s*([a-zA-Z]+)\s*([{(])/g;
  let match: RegExpExecArray | null;
  while ((match = at.exec(src))) {
    const kind = match[1].toLowerCase();
    let i = at.lastIndex;
    if (kind === "comment" || kind === "preamble") {
      at.lastIndex = readDelimited(src, i - 1)[1];
      continue;
    }
    const space = () => {
      while (i < src.length && /\s/.test(src[i])) i += 1;
    };
    const value = (): string => {
      let out = "";
      for (;;) {
        space();
        const char = src[i];
        if (char === "{" || char === '"') {
          const [read, next] = readDelimited(src, i);
          out += read;
          i = next;
        } else {
          const bare = /^[^\s,#}),]+/.exec(src.slice(i))?.[0] ?? "";
          out += strings.get(bare.toLowerCase()) ?? bare;
          i += bare.length;
        }
        space();
        if (src[i] !== "#") return out;
        i += 1;
      }
    };
    const fields = new Map<string, string>();
    let key = "";
    if (kind !== "string") {
      const comma = src.indexOf(",", i);
      if (comma < 0) break;
      key = src.slice(i, comma).trim();
      i = comma + 1;
    }
    for (;;) {
      space();
      if (i >= src.length || src[i] === "}" || src[i] === ")") break;
      const name = /^[^\s=,{}]+/.exec(src.slice(i))?.[0];
      if (!name) break;
      i += name.length;
      space();
      if (src[i] !== "=") break;
      i += 1;
      fields.set(name.toLowerCase(), value());
      space();
      if (src[i] === ",") i += 1;
    }
    at.lastIndex = i;
    if (kind === "string") {
      for (const [name, read] of fields) strings.set(name, read);
      continue;
    }
    const field = (name: string) => {
      const raw = fields.get(name);
      return raw === undefined ? undefined : unlatex(raw);
    };
    const container =
      field("journal") ?? field("journaltitle") ?? field("booktitle") ?? field("series");
    const source = readSource({
      id: key,
      type: BIBTEX_TYPES[kind] ?? "document",
      title: field("title"),
      author: fields.has("author") ? splitNames(fields.get("author")!).map(bibtexName) : undefined,
      editor: fields.has("editor") ? splitNames(fields.get("editor")!).map(bibtexName) : undefined,
      issued: { literal: field("year") ?? field("date") },
      "container-title": container,
      publisher: field("publisher") ?? field("school") ?? field("institution"),
      "publisher-place": field("address") ?? field("location"),
      volume: field("volume"),
      issue: field("number") ?? field("issue"),
      page: field("pages")?.replace(/-+/g, "–"),
      DOI: field("doi"),
      URL: fields.get("url")?.trim(),
    });
    if (source) sources.push(source);
  }
  return sources;
}

/** A file of sources, whichever of the two it is: CSL-JSON is what Zotero
 *  exports as "CSL JSON", an array or an object holding `items`. One key
 *  appearing twice is the later entry. */
export function parseSources(src: string): Source[] {
  const trimmed = src.replace(/^\uFEFF/, "").trim();
  let read: Source[];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      return [];
    }
    const items = Array.isArray(json) ? json : (json as { items?: unknown })?.items;
    read = Array.isArray(items)
      ? items.map(readSource).filter((source): source is Source => source !== null)
      : [];
  } else read = parseBibtex(trimmed);
  return [...new Map(read.map((source) => [source.id, source])).values()];
}

/* ── Printing ───────────────────────────────────────────────────────────── */

/** A piece of a printed entry: a title in a book style is in italics, and an
 *  export has to know which piece that is. */
export interface Run {
  text: string;
  italic?: boolean;
}

export const CITATION_WORDS = {
  it: { and: "e", etAl: "et al.", page: "p.", pages: "pp.", noDate: "s.d.", eds: "a cura di" },
  en: { and: "and", etAl: "et al.", page: "p.", pages: "pp.", noDate: "n.d.", eds: "ed." },
} as const;

export const yearOf = (source: Source): number | undefined => source.issued?.["date-parts"][0]?.[0];

const family = (name: CslName) => name.literal ?? name.family ?? "";

/** Who a source is by: its authors, else its editors, else nobody. */
const creators = (source: Source) => source.author ?? source.editor ?? [];

/** "12" is page 12, "12-15" pages 12 to 15; anything with a word in it —
 *  "chap. 3", "§ 4" — is said as it was typed. */
export function locatorText(locator: string, language: ReferenceLanguage): string {
  const clean = locator.trim();
  if (!/^[\divxlc]+(?:\s*[-–]\s*[\divxlc]+)?$/i.test(clean)) return clean;
  const words = CITATION_WORDS[language];
  return /[-–]/.test(clean)
    ? `${words.pages} ${clean.replace(/\s*[-–]\s*/, "–")}`
    : `${words.page} ${clean}`;
}

function shortCreators(source: Source, language: ReferenceLanguage): string {
  const people = creators(source);
  const words = CITATION_WORDS[language];
  if (!people.length) return REFERENCE_WORDS[language].quote(source.title ?? source.id);
  if (people.length === 1) return family(people[0]);
  if (people.length === 2) return `${family(people[0])} ${words.and} ${family(people[1])}`;
  return `${family(people[0])} ${words.etAl}`;
}

export interface CitationContext {
  style: CitationStyle;
  language: ReferenceLanguage;
  sources: Map<string, Source>;
  /** Each cited key's number in a numeric style, in first-cited order. */
  numbers: Map<string, number>;
}

/** What a citation prints: "(Rossi 2020, p. 12)" or "[3, p. 12]". A key the
 *  library does not hold prints itself with a question mark, as LaTeX does. */
export function citationText(
  key: string,
  locator: string | null | undefined,
  context: CitationContext,
): string {
  const source = context.sources.get(key);
  const at = locator?.trim() ? `, ${locatorText(locator, context.language)}` : "";
  if (!source) return context.style === "numeric" ? `[${key}?]` : `(${key}?)`;
  if (context.style === "numeric") return `[${context.numbers.get(key) ?? "?"}${at}]`;
  const when = yearOf(source) ?? CITATION_WORDS[context.language].noDate;
  return `(${shortCreators(source, context.language)} ${when}${at})`;
}

/** Each key's number: the order of first citation through the chapters as
 *  they stand, which is how a numeric style counts. */
export function citationNumbers(keys: Iterable<string>): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const key of keys) if (!numbers.has(key)) numbers.set(key, numbers.size + 1);
  return numbers;
}

function fullCreators(people: CslName[], language: ReferenceLanguage): string {
  const written = people.map((name, index) =>
    name.literal
      ? name.literal
      : !name.given
        ? (name.family ?? "")
        : index === 0
          ? `${name.family}, ${name.given}`
          : `${name.given} ${name.family}`,
  );
  if (written.length < 2) return written.join("");
  const and = CITATION_WORDS[language].and;
  /* "Rossi, Mario, and Luigi Bianchi": an inverted first name already ends
     in a name, so the comma before "and" is what keeps the two apart. */
  const comma = written.length > 2 || written[0].includes(",");
  return `${written.slice(0, -1).join(", ")}${comma ? "," : ""} ${and} ${written.at(-1)}`;
}

const ITALIC_TITLE = new Set(["book", "thesis", "report", "webpage", "document", "manuscript"]);

const stop = (value: string) => (/[.!?]$/.test(value) ? value : `${value}.`);

/** One entry of the bibliography. Author-date puts the year after the names,
 *  as Chicago's author-date does; numeric puts it at the end. */
export function entryRuns(
  source: Source,
  style: CitationStyle,
  language: ReferenceLanguage,
): Run[] {
  const words = CITATION_WORDS[language];
  const runs: Run[] = [];
  const add = (run: Run) => runs.push(run);
  const people = creators(source);
  const when = String(yearOf(source) ?? words.noDate);
  if (people.length) {
    const who = fullCreators(people, language);
    add({ text: `${stop(source.author ? who : `${who}, ${words.eds}`)} ` });
  }
  if (style === "author-date") add({ text: `${when}. ` });
  if (source.title) {
    if (ITALIC_TITLE.has(source.type)) {
      add({ text: source.title, italic: true });
      add({ text: /[.!?]$/.test(source.title) ? " " : ". " });
    } else add({ text: `${REFERENCE_WORDS[language].quote(stop(source.title))} ` });
  }
  if (source["container-title"]) {
    add({ text: source["container-title"], italic: true });
    const volume = source.volume
      ? ` ${source.volume}${source.issue ? ` (${source.issue})` : ""}`
      : "";
    add({ text: `${volume}${source.page ? `: ${source.page}` : ""}. ` });
  } else if (source.page) add({ text: `${words.pages} ${source.page}. ` });
  const house = [source["publisher-place"], source.publisher].filter(Boolean).join(": ");
  if (house) add({ text: `${house}. ` });
  if (style === "numeric") add({ text: `${when}. ` });
  if (source.DOI)
    add({ text: `https://doi.org/${source.DOI.replace(/^https?:\/\/doi\.org\//, "")}.` });
  else if (source.URL) add({ text: `${source.URL}.` });
  const last = runs.at(-1);
  if (last) last.text = last.text.trimEnd();
  return runs;
}

export interface BibliographyEntry {
  key: string;
  /** Its number in a numeric style. */
  number?: number;
  runs: Run[];
}

/** The works cited, and only those: in a numeric style in the order they
 *  are first cited, otherwise by the first author's surname, then year.
 *  ponytail: two works by one author in one year are not told apart with
 *  2020a / 2020b; add that here if a document needs it. */
export function bibliography(context: CitationContext): BibliographyEntry[] {
  const cited = [...context.numbers.keys()]
    .map((key) => context.sources.get(key))
    .filter((source): source is Source => source !== undefined);
  if (context.style === "author-date") {
    const sortKey = (source: Source) =>
      `${family(creators(source)[0] ?? {}) || source.title || source.id}\u0000${yearOf(source) ?? 9999}`;
    cited.sort((a, b) => sortKey(a).localeCompare(sortKey(b), context.language));
  }
  return cited.map((source) => ({
    key: source.id,
    number: context.style === "numeric" ? context.numbers.get(source.id) : undefined,
    runs: entryRuns(source, context.style, context.language),
  }));
}

export const runsText = (runs: Run[]): string => runs.map((run) => run.text).join("");
