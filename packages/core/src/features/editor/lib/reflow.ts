import { Fragment, Mark, Slice, type Node } from "@tiptap/pm/model";

/* Text copied out of a PDF arrives one paragraph per printed line: the PDF
   has no paragraphs, only lines at positions. Read as written, a letter
   pasted into a book is a stack of short paragraphs, each its own block on
   the sheet. Nothing on the clipboard says where a paragraph really ended,
   so the lines are read the way a reader reads them: a line that ran to the
   measure was wrapped, a short one that ends a sentence ended a paragraph,
   a short one with no sentence in it is a heading. */

/** For each line but the last: does the next line continue it? */
export function hardWraps(lines: string[]): boolean[] {
  const lengths = lines.map((line) => line.trim().length);
  const sorted = lengths.filter(Boolean).sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1] ?? 0;
  const none = lines.slice(1).map(() => false);
  /* Real paragraphs are hundreds of characters and uneven; printed lines are
     a measure wide and alike. A poem's lines are short, and stay lines. */
  if (sorted.length < 3 || median < 40 || sorted[sorted.length - 1] > 140) return none;
  const alike = sorted.filter((n) => n >= median * 0.7 && n <= median * 1.3).length;
  if (alike < sorted.length * 0.6) return none;
  return none.map((_, index) => {
    const line = lines[index].trim();
    const next = lines[index + 1].trim();
    if (!line || !next) return false;
    if (/^(?:[—–\-•·*]|\d+[.)]\s)/.test(next)) return false;
    if (/[.!?…:;»"”)]$/.test(line)) return line.length >= median * 0.85;
    return line.length >= median * 0.7;
  });
}

/* A page turn on the clipboard is no character at all: the last line of one
   page and the heading of the next are glued, "p. 134Il bello". What gives
   it away is the style changing at the seam with no space in it. */
function splitAtStyleSeams(paragraph: Node): Node[] {
  const out: Node[] = [];
  let run: Node[] = [];
  paragraph.forEach((child) => {
    const previous = run[run.length - 1];
    if (
      previous?.isText &&
      child.isText &&
      !Mark.sameSet(previous.marks, child.marks) &&
      /[\p{Ll}\d]$/u.test(previous.text ?? "") &&
      /^\p{Lu}/u.test(child.text ?? "")
    ) {
      out.push(paragraph.copy(Fragment.from(run)));
      run = [];
    }
    run.push(child);
  });
  out.push(paragraph.copy(Fragment.from(run)));
  return out;
}

/* A book has one letter, set in its page set-up; a PDF's font names are
   whatever the exporter wrote. Colour and emphasis stay. */
function withoutFonts(fragment: Fragment): Fragment {
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    if (!node.isText) {
      nodes.push(node.copy(withoutFonts(node.content)));
      return;
    }
    const marks = node.marks.flatMap((mark) => {
      if (mark.type.name !== "textStyle") return [mark];
      const attrs = { ...mark.attrs, fontFamily: null, fontSize: null, lineHeight: null };
      return Object.values(attrs).some((value) => value != null && value !== "")
        ? [mark.type.create(attrs)]
        : [];
    });
    nodes.push(node.mark(marks));
  });
  return Fragment.fromArray(nodes);
}

export function reflowPasted(slice: Slice, options: { dropFonts: boolean }): Slice {
  let content = options.dropFonts ? withoutFonts(slice.content) : slice.content;
  /* A document spaced with empty paragraphs — eleven of them above an
     epigraph, four for a page turn — is spaced by the sheet here. */
  const blank = (node: Node) => {
    let only = node.type.name === "paragraph" && !node.textContent.trim();
    node.forEach((child) => (only &&= child.isText || child.type.name === "hardBreak"));
    return only;
  };
  const blocks: Node[] = [];
  content.forEach((node) => {
    const spacer = content.childCount >= 3 && blank(node);
    if (!spacer || (blocks.length && !blank(blocks[blocks.length - 1]))) blocks.push(node);
  });
  if (!blocks.length) return slice;
  while (blocks.length > 1 && blank(blocks[blocks.length - 1])) blocks.pop();
  if (blocks.length !== content.childCount) content = Fragment.fromArray(blocks);
  if (blocks.length >= 3 && blocks.every((node) => node.type.name === "paragraph")) {
    const lines = blocks.flatMap(splitAtStyleSeams);
    const joins = hardWraps(lines.map((node) => node.textContent));
    const merged: Node[] = [];
    lines.forEach((node, index) => {
      const previous = merged[merged.length - 1];
      if (index === 0 || !joins[index - 1]) {
        merged.push(node);
        return;
      }
      const hyphen = /\p{L}-$/u.test(previous.textContent) && /^\p{Ll}/u.test(node.textContent);
      let head = previous.content;
      if (hyphen) head = head.cut(0, head.size - 1);
      const spaced = /\s$/.test(previous.textContent) || /^\s/.test(node.textContent);
      const gap = hyphen || spaced ? Fragment.empty : Fragment.from(node.type.schema.text(" "));
      merged[merged.length - 1] = previous.copy(head.append(gap).append(node.content));
    });
    content = Fragment.fromArray(merged);
  }
  /* An open start pours the first paragraph into the one under the caret,
     which keeps its own setting: a centred epigraph lands flush left. A
     first paragraph that says where it sits arrives whole. */
  const openStart = content.firstChild?.attrs.textAlign ? 0 : slice.openStart;
  if (content === slice.content && openStart === slice.openStart) return slice;
  return new Slice(content, openStart, slice.openEnd);
}

/* Pages, TextEdit and Word put their formatting on the clipboard as RTF, and
   Chromium hands it over as HTML whose every style lives in a `<style>`
   block, keyed by class — `p.p3 {text-align: center}`, `span.s1 {font:
   italic 12px Times}`. The editor reads inline styles and tags, never a
   stylesheet, so the centring and the italics were on the clipboard and
   were dropped. Each rule is written onto the elements it matches, and the
   `font` shorthand, which no mark reads, is said again as tags. */
export function inlinePastedStyles(html: string): string {
  if (!/<style/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const css = Array.from(doc.querySelectorAll("style"), (style) => style.textContent ?? "").join(
    "\n",
  );
  for (const [, selector, declarations] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    let targets: Element[];
    try {
      targets = Array.from(doc.body.querySelectorAll(selector.trim()));
    } catch {
      continue;
    }
    for (const element of targets) {
      if (!(element instanceof HTMLElement)) continue;
      const inline = element.style.cssText;
      element.style.cssText = `${declarations};${inline}`;
    }
  }
  for (const element of Array.from(doc.body.querySelectorAll<HTMLElement>("[style]"))) {
    const italic = element.style.fontStyle === "italic";
    const weight = element.style.fontWeight;
    const bold = weight === "bold" || Number(weight) >= 600;
    for (const tag of [italic && "em", bold && "strong"]) {
      if (!tag || !element.firstChild) continue;
      const wrapper = doc.createElement(tag);
      wrapper.append(...Array.from(element.childNodes));
      element.append(wrapper);
    }
  }
  return doc.body.innerHTML;
}
