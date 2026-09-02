import {
  Extension,
  Mark,
  Node,
  mergeAttributes,
  type JSONContent,
  type MarkdownToken,
} from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { TextStyleKit } from "@tiptap/extension-text-style";
import { MarkdownManager } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

export const RICH_TEXT_VERSION = 1;

export type TextColor = "yellow" | "purple" | "pink" | "orange" | "mint" | "blue";

export const TEXT_COLORS: readonly TextColor[] = [
  "yellow",
  "purple",
  "pink",
  "orange",
  "mint",
  "blue",
];

export const TEXT_COLOR_VALUE: Record<TextColor, string> = {
  yellow: "var(--tint-yellow)",
  purple: "var(--tint-purple)",
  pink: "var(--tint-pink)",
  orange: "var(--tint-orange)",
  mint: "var(--tint-mint)",
  blue: "var(--tint-blue)",
};

export const EMPTY_RICH_TEXT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/* The former editor stored colour as ==purple:words==. This tokenizer exists
   only at the import boundary: once parsed, colour is a TextStyle attribute and
   those delimiters can never leak back into what the user writes. */
const LegacyColorMarkdown = Extension.create({
  name: "legacyColorMarkdown",
  markdownTokenName: "legacyColor",
  markdownTokenizer: {
    name: "legacyColor",
    level: "inline",
    start: "==",
    tokenize(src, _tokens, lexer) {
      const match = /^==(?:(yellow|purple|pink|orange|mint|blue):)?([\s\S]+?)==/.exec(src);
      if (!match) return undefined;
      return {
        type: "legacyColor",
        raw: match[0],
        color: match[1] ?? "yellow",
        tokens: lexer.inlineTokens(match[2]),
      };
    },
  },
  parseMarkdown(token: MarkdownToken, helpers) {
    const color = TEXT_COLOR_VALUE[(token.color as TextColor) ?? "yellow"];
    return helpers.applyMark("textStyle", helpers.parseInline(token.tokens ?? []), { color });
  },
});

/* The schema half of the two private-media nodes. The editor extends each with
   its React node view and a resolver; everything that only needs to know the
   shape of the document — the legacy parser, the Markdown serializer, the Yjs
   conversion in `ydoc.ts` and the collaboration server — takes them as they
   are, and none of that can run React. Keeping one definition is what stops a
   note written in the browser from being unreadable to the server. */
export const PrivateImage = Node.create({
  name: "privateImage",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      objectId: { default: "" },
      alt: { default: "Image" },
      /* Ink over the picture, held exactly the way a drawing holds it — a JSON
         string, for the two reasons in `Drawing` below. It does not leave in
         an export: a picture leaves as `napp-image:`, which carries no bytes
         of its own, so there is nothing for the strokes to be drawn on. */
      strokes: { default: "[]" },
    };
  },
  parseHTML: () => [{ tag: "napp-private-image" }],
  renderHTML({ HTMLAttributes }) {
    return ["napp-private-image", mergeAttributes(HTMLAttributes)];
  },
});

export const PrivateFile = Node.create({
  name: "privateFile",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return { objectId: { default: "" }, label: { default: "Attachment" } };
  },
  parseHTML: () => [{ tag: "napp-private-file" }],
  renderHTML({ HTMLAttributes }) {
    return ["napp-private-file", mergeAttributes(HTMLAttributes)];
  },
});

/* A passage somebody has remarked on.
 *
 * The anchor lives in the document, not in a column: a comment is about words,
 * and words move. Carried as a mark it converges with the text through Yjs,
 * survives every edit either person makes above it, and needs no stored offset
 * that would be wrong the moment a line was typed higher up. The remark itself
 * — who, when, what — is a row in `note_comments`, joined by this id.
 *
 * `inclusive: false` so typing at either end of a commented passage writes
 * outside it rather than quietly enlarging what was remarked on. It excludes
 * nothing, so a passage can carry a comment and a colour at once.
 *
 * It belongs in the schema rather than in the editor alone, because the
 * Markdown serializer, the legacy parser, the Yjs conversion and the
 * collaboration server all read documents that may contain it, and a schema
 * that does not know a mark drops it. */
export const CommentAnchor = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      threadId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-comment-thread") ?? "",
        renderHTML: (attributes) =>
          attributes.threadId ? { "data-comment-thread": attributes.threadId } : {},
      },
      resolved: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-comment-resolved") === "true",
        renderHTML: (attributes) =>
          attributes.resolved ? { "data-comment-resolved": "true" } : {},
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-comment-thread]" }],
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "note-comment-anchor" }), 0];
  },
  /* A comment is this archive's conversation about the passage, not part of
     it. Markdown leaves with the words and without the thread — a reader in
     Obsidian has no comment to open, and `napp-comment:` in their file would
     be the broken link `demotePrivateMedia` exists to avoid inventing more
     of. */
  renderMarkdown: (mark, helpers) => helpers.renderChildren(mark),
});

/* A drawing made by hand, in the note.
 *
 * The strokes are the node's own attribute and nothing else: no Storage
 * object, no upload, no second thing that can be missing when the note is
 * read. A drawing therefore travels with the document — through Yjs to the
 * other member, into the Postgres projection, out into an exported file — the
 * way a paragraph does.
 *
 * They are held as a JSON *string* rather than an array, and that is
 * load-bearing twice. y-prosemirror diffs node attributes with `!==`, so an
 * array would be a different object on every comparison and would be rewritten
 * into the document on every keystroke anywhere in the note. And an attribute
 * Yjs holds as a string is one it stores and compares without knowing anything
 * about what is in it.
 *
 * ponytail: one attribute for the whole drawing, so two people drawing on the
 * same sketch in the same second keep the later of the two sets of strokes
 * rather than both. Split it into a child node per stroke if that ever
 * happens to anybody. */

/** Six inks, saturated enough to read on both grounds — no black, no white,
 *  because a drawing has to survive the theme being switched under it. */
export const DRAWING_INKS = [
  "#5B9BFF",
  "#F4C550",
  "#F27FA5",
  "#69CFA1",
  "#BF8CF2",
  "#F5884E",
] as const;

/** The coordinate space every stroke is stored in, so a drawing scales with
 *  the column it is read in rather than with the window it was made in.
 *
 *  Both surfaces measure x across the width they are drawn on, and a board is
 *  this tall. A page has no height of its own — it is as tall as the note — so
 *  its strokes measure y on the *same* scale as x and simply run past 560.
 *  That keeps one number in the file and one shape on the screen: a drawing
 *  scales with the column and never stretches. */
export const DRAWING_BOX = { width: 1000, height: 560 };

export interface DrawingStroke {
  d: string;
  color: string;
  width: number;
}

/* A document arrives from the other member, from an import, or from whatever a
   file on disk held. What comes out of it goes into an SVG attribute, so it is
   read strictly rather than trusted: path data is digits and the handful of
   commands this writes, and an ink is a hex colour. Anything else is not a
   stroke and is dropped rather than repaired. */
const PATH_DATA = /^[ML][-\d.,\s ML]*$/;
/* Six or eight digits: the highlighter is the same ink with an alpha on the
   end, which keeps a translucent stroke a colour rather than a second field on
   every stroke ever written. */
const INK = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export function drawingStrokes(value: unknown): DrawingStroke[] {
  if (typeof value !== "string" || !value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((entry) => {
    const stroke = entry as Partial<DrawingStroke> | null;
    if (!stroke || typeof stroke.d !== "string" || !PATH_DATA.test(stroke.d)) return [];
    const color =
      typeof stroke.color === "string" && INK.test(stroke.color) ? stroke.color : DRAWING_INKS[0];
    const width =
      typeof stroke.width === "number" && stroke.width > 0 && stroke.width <= 40 ? stroke.width : 5;
    return [{ d: stroke.d, color, width }];
  });
}

/** The drawing as a standalone picture. This is what leaves in an exported
 *  file: Obsidian renders inline SVG, and unlike `napp-image:` it carries its
 *  own bytes, so it is a picture in somebody else's vault rather than a broken
 *  link. One-way, like `[[Title]]` — reading it back would mean parsing
 *  somebody's arbitrary SVG, and this file is not going to grow a parser. */
export function drawingSvg(strokes: DrawingStroke[], surface: DrawingSurface = "board"): string {
  const { width, height } = drawingBox(strokes, surface);
  const paths = strokes
    .map(
      (stroke) =>
        `<path d="${stroke.d}" fill="none" stroke="${stroke.color}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Drawing">${paths}</svg>`;
}

/** Where the ink sits: on a sheet of its own, or over the page itself. */
export type DrawingSurface = "board" | "page";

export const drawingSurface = (value: unknown): DrawingSurface =>
  value === "page" ? "page" : "board";

/** The box a set of strokes needs. A board is always the same one; a page is
 *  as tall as the lowest stroke on it, because the note it was drawn over has
 *  no height until it is read. */
export function drawingBox(
  strokes: DrawingStroke[],
  surface: DrawingSurface,
): { width: number; height: number } {
  if (surface === "board") return DRAWING_BOX;
  let lowest = 0;
  for (const stroke of strokes) {
    /* Every second number in the path is a y. The path data has already been
       through `drawingStrokes`, so these are numbers or the stroke is gone. */
    const points = stroke.d.slice(1).split(/[ML]/);
    for (const point of points) {
      const y = Number(point.split(",")[1]);
      if (Number.isFinite(y)) lowest = Math.max(lowest, y + stroke.width);
    }
  }
  return { width: DRAWING_BOX.width, height: Math.max(Math.ceil(lowest), 1) };
}

/** A stroke somebody held still at the end of, as the shape they meant.
 *
 *  Three shapes and no more: a line, a rectangle, an ellipse. Which one is
 *  decided by measuring the points against each candidate rather than by
 *  recognising anything — a closed stroke is whichever of the two it sits
 *  closer to, in units of its own half-size so a small circle is judged as
 *  strictly as a large one.
 *
 *  The ellipse is emitted as line segments because `PATH_DATA` above admits
 *  `M` and `L` and nothing else, and a stored format that grows a curve
 *  command is a stored format every reader has to learn. Forty-eight segments
 *  is smooth at any size a note is read at.
 *
 *  Null means the stroke is too small or too short to have meant a shape,
 *  which is the answer for a tick, a dot, or a scribble. */
export function straightenStroke(points: { x: number; y: number }[]): string | null {
  if (points.length < 4) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const width = right - left;
  const height = bottom - top;
  const span = Math.max(width, height);
  if (span < 40) return null;

  const first = points[0];
  const last = points[points.length - 1];
  const closed = Math.hypot(last.x - first.x, last.y - first.y) < span * 0.3;
  const round = (n: number) => Math.round(n);
  if (!closed) return `M${round(first.x)},${round(first.y)}L${round(last.x)},${round(last.y)}`;

  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const rx = Math.max(width / 2, 1);
  const ry = Math.max(height / 2, 1);
  const half = span / 2;

  const mean = (of: (p: { x: number; y: number }) => number) =>
    points.reduce((sum, p) => sum + of(p), 0) / points.length;
  const roundness = mean((p) => Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1));
  const squareness = mean(
    (p) =>
      Math.min(
        Math.abs(p.x - left),
        Math.abs(right - p.x),
        Math.abs(p.y - top),
        Math.abs(bottom - p.y),
      ) / half,
  );

  if (squareness < roundness) {
    return (
      `M${round(left)},${round(top)}L${round(right)},${round(top)}` +
      `L${round(right)},${round(bottom)}L${round(left)},${round(bottom)}L${round(left)},${round(top)}`
    );
  }
  const steps = 48;
  let path = "";
  for (let step = 0; step <= steps; step += 1) {
    const angle = (step / steps) * Math.PI * 2;
    const x = round(cx + rx * Math.cos(angle));
    const y = round(cy + ry * Math.sin(angle));
    path += `${step === 0 ? "M" : "L"}${x},${y}`;
  }
  return path;
}

export const Drawing = Node.create({
  name: "drawing",
  group: "block",
  atom: true,
  draggable: true,
  addAttributes() {
    return {
      strokes: {
        default: "[]",
        parseHTML: (element) => element.getAttribute("strokes") ?? "[]",
        renderHTML: (attributes) => ({ strokes: attributes.strokes }),
      },
      /* Where the ink sits: on a sheet of its own, or on the page itself. It
         is the same node and the same strokes either way — a board is a card
         drawn under them, and nothing else, which is why this is one string
         and not a second node type. */
      surface: {
        default: "board",
        parseHTML: (element) => drawingSurface(element.getAttribute("surface")),
        renderHTML: (attributes) => ({ surface: attributes.surface }),
      },
    };
  },
  parseHTML: () => [{ tag: "napp-drawing" }],
  renderHTML({ HTMLAttributes }) {
    return ["napp-drawing", mergeAttributes(HTMLAttributes)];
  },
  renderMarkdown: (node) =>
    `${drawingSvg(drawingStrokes(node.attrs?.strokes), drawingSurface(node.attrs?.surface))}\n\n`,
});

/** The name of the mark below, needed by anything that reads a document
 *  looking for one rather than building a schema. */
export const WRITE_LOCK_MARK = "writeLock";

/* A passage one member has taken back.
 *
 * The archive is shared and both members write every note, so this is the
 * smaller half of `notes.locked_by`: the note stays everybody's and one
 * passage of it stops being. Like the comment anchor it is a mark and not a
 * stored offset, because a lock is about words and words move — carried in
 * the document it converges with the text through Yjs and survives every edit
 * made above it.
 *
 * Unlike `notes.locked_by` there is no column for Postgres to refuse, because
 * a passage is inside a document both members may write. The boundary is the
 * collaboration server, which reads this mark on every message and puts back
 * anything a foreign lock covers — see `writeLocks.ts`. The editor refuses the
 * edit first, which is a courtesy; the server is what makes it true.
 *
 * `inclusive: false` so typing at either end writes outside the lock rather
 * than quietly enlarging what somebody took back. */
export const WriteLock = Mark.create({
  name: WRITE_LOCK_MARK,
  inclusive: false,
  /* It excludes itself, which is ProseMirror's default and the only sensible
     reading: one passage, one holder. That also keeps it out of y-prosemirror's
     overlapping-mark encoding, where a mark that may coexist with itself is
     stored under a per-instance key — a lock read by key would then be read by
     a name that changes. It still sits happily under a comment or a colour;
     `excludes` is only ever about its own type. */
  addAttributes() {
    return {
      owner: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-write-lock") ?? "",
        renderHTML: (attributes) =>
          attributes.owner ? { "data-write-lock": attributes.owner } : {},
      },
    };
  },
  parseHTML: () => [{ tag: "span[data-write-lock]" }],
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "note-write-lock" }), 0];
  },
  /* The words alone. Who may write a passage is a fact about this archive and
     means nothing in somebody else's Obsidian — and an account id in their
     file would be exactly the broken link `demotePrivateMedia` exists to
     avoid inventing more of. */
  renderMarkdown: (mark, helpers) => helpers.renderChildren(mark),
});

/** A link from one note in this archive to another.
 *
 * A mark and not a node, so the words stay words: the title reads in the
 * sentence, is found by search, and leaves in the export as text rather than
 * as a placeholder the reader has to decode.
 *
 * `inclusive: false` for the same reason the comment anchor is — typing at
 * either end of a link writes outside it rather than quietly swallowing the
 * next word into the link's text.
 *
 * It belongs in the schema and not in the editor alone: the Markdown
 * serializer, the legacy parser, the Yjs conversion and the collaboration
 * server all read documents that may contain it, and a schema that does not
 * know a mark drops it. */
export const NoteLink = Mark.create({
  name: "noteLink",
  inclusive: false,
  excludes: "",
  addAttributes() {
    return {
      noteId: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-note") ?? "",
        renderHTML: (attributes) => (attributes.noteId ? { "data-note": attributes.noteId } : {}),
      },
    };
  },
  parseHTML: () => [{ tag: "a[data-note]" }],
  renderHTML({ HTMLAttributes }) {
    return ["a", mergeAttributes(HTMLAttributes, { class: "note-link" }), 0];
  },
  /* `[[Title]]`, which is Obsidian's own syntax and not an invention of this
     app — so a link exported with the archive around it resolves in the vault
     it lands in. That is the one difference from the comment anchor, which
     leaves its id behind because a thread id in somebody else's Obsidian is
     the broken link `demotePrivateMedia` exists to avoid making more of.

     One-way, and deliberately. Reading `[[Title]]` back would mean resolving a
     title to a note id, which needs the archive; this file has no archive and
     is not going to grow one. An imported file keeps the words and loses the
     link, which is the honest half to lose. */
  renderMarkdown: (mark, helpers) => `[[${helpers.renderChildren(mark)}]]`,
});

/** Everything the schema holds except the two private-media nodes, which the
 *  editor supplies in an extended form. */
export const BASE_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    /* A link opens on a plain click, in a new tab. `openOnClick: false` made
       clicking one put a caret inside the text instead, which is what a reader
       never wants and what a writer has the toolbar's link dialog for. The
       `rel` keeps the opened page from reaching back through `window.opener`;
       the extension's own URI check still refuses `javascript:`. */
    link: {
      openOnClick: true,
      autolink: true,
      defaultProtocol: "https",
      HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" },
    },
  }),
  TextStyleKit,
  TableKit,
  TaskList,
  TaskItem.configure({ nested: true }),
  Image.configure({ allowBase64: true }),
  LegacyColorMarkdown,
  CommentAnchor,
  WriteLock,
  NoteLink,
];

/** The persisted document schema, whole. */
export const DOCUMENT_EXTENSIONS = [...BASE_EXTENSIONS, PrivateImage, PrivateFile, Drawing];

const legacyMarkdown = new MarkdownManager({
  extensions: DOCUMENT_EXTENSIONS,
  markedOptions: { gfm: true, breaks: true },
});

function privateReference(value: unknown, scheme: "napp-image:" | "napp-file:"): string | null {
  if (typeof value !== "string" || !value.startsWith(scheme)) return null;
  const id = value.slice(scheme.length).trim();
  return id || null;
}

/** Convert the old Markdown media syntax into first-class document nodes. */
function promotePrivateMedia(node: JSONContent): JSONContent {
  const content = node.content?.map(promotePrivateMedia);

  if (node.type === "image") {
    const objectId = privateReference(node.attrs?.src, "napp-image:");
    if (objectId) {
      return {
        type: "privateImage",
        attrs: { objectId, alt: typeof node.attrs?.alt === "string" ? node.attrs.alt : "Image" },
      };
    }
  }

  if (node.type === "paragraph" && content?.length === 1 && content[0].type === "text") {
    const marks = content[0].marks ?? [];
    const link = marks.find((mark) => mark.type === "link");
    const objectId = privateReference(link?.attrs?.href, "napp-file:");
    if (objectId) {
      return {
        type: "privateFile",
        attrs: { objectId, label: content[0].text || "Attachment" },
      };
    }
  }

  return content ? { ...node, content } : node;
}

export function isRichTextDocument(value: unknown): value is JSONContent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as JSONContent;
  return (
    candidate.type === "doc" &&
    (candidate.content === undefined || Array.isArray(candidate.content))
  );
}

export function legacyMarkdownToRichText(markdown: string): JSONContent {
  if (!markdown.trim()) return structuredClone(EMPTY_RICH_TEXT);
  const cleaned = markdown
    .split("\n")
    .filter((line, index, lines) => {
      if (!/^\s*={4,}\s*$/.test(line)) return true;
      // Keep a real Setext heading underline, discard the orphan colour closers
      // left by the former editor at the start of a note or after a blank line.
      return index > 0 && lines[index - 1].trim().length > 0;
    })
    .join("\n");
  return promotePrivateMedia(legacyMarkdown.parse(cleaned));
}

/** The inverse of the legacy parser, over the same extensions, so what this
 *  writes is what `legacyMarkdownToRichText` reads. Private media is demoted
 *  back to the `napp-image:` / `napp-file:` references the parser promotes —
 *  a Markdown file cannot carry a Storage object, and a reference at least
 *  survives a round trip through this app. */
export function richTextToMarkdown(document: JSONContent): string {
  return legacyMarkdown.serialize(demotePrivateMedia(document));
}

function demotePrivateMedia(node: JSONContent): JSONContent {
  if (node.type === "privateImage") {
    return {
      type: "image",
      attrs: {
        src: `napp-image:${String(node.attrs?.objectId ?? "")}`,
        alt: typeof node.attrs?.alt === "string" ? node.attrs.alt : "Image",
      },
    };
  }
  if (node.type === "privateFile") {
    const label = String(node.attrs?.label ?? "Attachment");
    return {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: label,
          marks: [
            { type: "link", attrs: { href: `napp-file:${String(node.attrs?.objectId ?? "")}` } },
          ],
        },
      ],
    };
  }
  const content = node.content?.map(demotePrivateMedia);
  return content ? { ...node, content } : node;
}

export function noteDocument(
  content: unknown,
  contentVersion: number,
  legacyBody: string,
): JSONContent {
  if (contentVersion === RICH_TEXT_VERSION && isRichTextDocument(content)) return content;
  return legacyMarkdownToRichText(legacyBody);
}

function readableText(node: JSONContent): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "privateFile") return String(node.attrs?.label ?? "Attachment");
  if (node.type === "privateImage") return String(node.attrs?.alt ?? "");

  const children = (node.content ?? []).map(readableText).join("");
  if (
    [
      "paragraph",
      "heading",
      "blockquote",
      "listItem",
      "taskItem",
      "tableCell",
      "tableHeader",
      "privateFile",
    ].includes(node.type ?? "")
  ) {
    return `${children}\n`;
  }
  return children;
}

export function richTextToPlainText(document: JSONContent): string {
  return readableText(document)
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type DocumentGlyph = "attachment" | "image" | "checklist" | "table" | "text";

export function documentGlyph(document: JSONContent): DocumentGlyph {
  let result: DocumentGlyph = "text";
  const rank: Record<DocumentGlyph, number> = {
    text: 0,
    table: 1,
    checklist: 2,
    image: 3,
    attachment: 4,
  };
  const visit = (node: JSONContent) => {
    const candidate: DocumentGlyph | null =
      node.type === "privateFile"
        ? "attachment"
        : node.type === "privateImage" || node.type === "image"
          ? "image"
          : node.type === "taskList"
            ? "checklist"
            : node.type === "table"
              ? "table"
              : null;
    if (candidate && rank[candidate] > rank[result]) result = candidate;
    node.content?.forEach(visit);
  };
  visit(document);
  return result;
}

/** The first drawing in a note, as the strokes it is made of — for a list
 *  that wants to show the sketch rather than a glyph standing in for one.
 *  Reading the document that is already in memory, not a column: a drawing is
 *  a node, so there is nothing to index. */
export function firstDrawing(
  document: JSONContent,
): { strokes: DrawingStroke[]; surface: DrawingSurface } | null {
  let found: { strokes: DrawingStroke[]; surface: DrawingSurface } | null = null;
  const visit = (node: JSONContent) => {
    if (found) return;
    if (node.type === "drawing") {
      const strokes = drawingStrokes(node.attrs?.strokes);
      if (strokes.length > 0) {
        found = { strokes, surface: drawingSurface(node.attrs?.surface) };
        return;
      }
    }
    node.content?.forEach(visit);
  };
  visit(document);
  return found;
}

/** How much of a note's checklists is done, or null when it has none. Every
 *  list in the note counted as one, because the row has space for one answer
 *  and "what is left" is the question it answers. */
export function checklistProgress(document: JSONContent): { done: number; total: number } | null {
  let done = 0;
  let total = 0;
  const visit = (node: JSONContent) => {
    if (node.type === "taskItem") {
      total += 1;
      if (node.attrs?.checked) done += 1;
    }
    node.content?.forEach(visit);
  };
  visit(document);
  return total > 0 ? { done, total } : null;
}

/* ── What the editor leaves behind ───────────────────────────────────────────
   A trailing empty paragraph or a trailing space is what ProseMirror leaves
   after a writer adds something at the end of a note and deletes the visible
   characters again. Neither has readable content, so neither must turn an
   otherwise restored note into a new edit — not in the draft store, and not in
   the projection the collaboration server compares against the stored row.
   Keep the one empty paragraph that represents a genuinely blank note. */

export function withoutInvisibleDocumentEnding(content: JSONContent): JSONContent {
  if (content.type !== "doc" || !Array.isArray(content.content)) return content;
  const normalized = structuredClone(content);
  const nodes = normalized.content;
  if (!nodes) return normalized;
  /* Trimming and popping feed each other, so they alternate rather than run
     once each: a trailing "  " paragraph does not read as empty until it has
     been trimmed, and the trim reaches the last real text node only once the
     empty paragraphs after it are gone. Doing the trim first and the pops
     after — which is how this read before — left a trailing space behind
     whenever an empty paragraph followed it, which is exactly the shape a
     writer leaves by typing a word and a return and deleting the word. */
  for (;;) {
    trimFinalTextWhitespace(normalized);
    if (nodes.length > 1 && isEmptyParagraph(nodes.at(-1))) nodes.pop();
    else return normalized;
  }
}

function trimFinalTextWhitespace(node: JSONContent): void {
  const last = node.content?.at(-1);
  if (last) return trimFinalTextWhitespace(last);
  if (node.type === "text" && typeof node.text === "string")
    node.text = node.text.replace(/\s+$/, "");
}

function isEmptyParagraph(node: JSONContent | undefined): boolean {
  return (
    node?.type === "paragraph" &&
    (!node.content?.length ||
      node.content.every((child) => child.type === "text" && !(child.text ?? "")))
  );
}
