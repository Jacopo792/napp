import type { JSONContent } from "@tiptap/core";
import {
  DRAWING_TEXT_FONT,
  drawingMarks,
  drawingSvg,
  isDrawingText,
  type DrawingMark,
} from "./content";
import { exportFileName } from "./exchange";
import { platform } from "@/platform";

type Resolve = (id: string) => Promise<Blob>;
function png(canvas: HTMLCanvasElement): Uint8Array {
  return Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (c) => c.charCodeAt(0));
}
async function picture(blob: Blob, marks: DrawingMark[] = []): Promise<HTMLCanvasElement> {
  const src = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const scale = canvas.width / 1000;
    ctx.scale(scale, scale);
    for (const mark of marks) {
      if (isDrawingText(mark)) {
        ctx.fillStyle = mark.color;
        ctx.font = `${mark.size}px ${DRAWING_TEXT_FONT}`;
        ctx.textBaseline = "alphabetic";
        ctx.fillText(mark.text, mark.x, mark.y);
        continue;
      }
      const path = new Path2D(mark.d);
      /* Under the outline, never over it: a closed shape is its edge, and a
         fill painted afterwards eats half the line that draws it. */
      if (mark.fill) {
        ctx.fillStyle = mark.fill;
        ctx.fill(path);
      }
      ctx.strokeStyle = mark.color;
      ctx.lineWidth = mark.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(path);
    }
    return canvas;
  } finally {
    URL.revokeObjectURL(src);
  }
}

export async function exportDocx(
  title: string,
  content: JSONContent,
  resolve: Resolve,
): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    ImageRun,
    Table,
    TableRow,
    TableCell,
    ExternalHyperlink,
    FootnoteReferenceRun,
    WidthType,
  } = await import("docx");
  /* Word's own footnotes, numbered by Word: the one place an export already
     has somewhere real to put them. A cross-reference leaves as the words it
     was made with; its live numbering is the document export's to do. */
  const footnotes: Record<string, { children: InstanceType<typeof Paragraph>[] }> = {};
  let footnoteCount = 0;
  const inline = (
    node: JSONContent,
    mono = false,
  ): (
    | InstanceType<typeof TextRun>
    | InstanceType<typeof ExternalHyperlink>
    | InstanceType<typeof FootnoteReferenceRun>
  )[] =>
    (node.content ?? []).flatMap((child) => {
      if (child.type === "hardBreak") return [new TextRun({ break: 1 })];
      if (child.type === "footnote") {
        footnoteCount += 1;
        const text = typeof child.attrs?.text === "string" ? child.attrs.text : "";
        footnotes[footnoteCount] = {
          children: text.split("\n").map((line) => new Paragraph({ text: line })),
        };
        return [new FootnoteReferenceRun(footnoteCount)];
      }
      if (child.type === "crossReference")
        return [new TextRun({ text: String(child.attrs?.label ?? "") })];
      if (child.type !== "text") return inline(child, mono);
      const marks = child.marks ?? [];
      const style = marks.find((m) => m.type === "textStyle")?.attrs;
      const color = String(style?.color ?? "").replace("#", "");
      const run = new TextRun({
        text: child.text ?? "",
        bold: marks.some((m) => m.type === "bold"),
        italics: marks.some((m) => m.type === "italic"),
        strike: marks.some((m) => m.type === "strike"),
        underline: marks.some((m) => m.type === "underline") ? {} : undefined,
        color: /^[0-9a-f]{6}$/i.test(color) ? color : undefined,
        size: style?.fontSize ? Math.round(parseFloat(String(style.fontSize)) * 1.5) : undefined,
        font: mono || marks.some((m) => m.type === "code") ? "Courier New" : undefined,
      });
      const link = marks.find((m) => m.type === "link")?.attrs?.href;
      return [
        typeof link === "string" && /^https?:\/\//.test(link)
          ? new ExternalHyperlink({ children: [run], link })
          : run,
      ];
    });
  type Block = InstanceType<typeof Paragraph> | InstanceType<typeof Table>;
  async function blocks(node: JSONContent, prefix = ""): Promise<Block[]> {
    if (node.type === "privateImage" || node.type === "image" || node.type === "drawing") {
      let canvas: HTMLCanvasElement;
      if (node.type === "drawing")
        canvas = await picture(
          new Blob([drawingSvg(drawingMarks(node.attrs?.strokes), node.attrs?.surface)], {
            type: "image/svg+xml",
          }),
        );
      else {
        const blob =
          node.type === "privateImage"
            ? await resolve(String(node.attrs?.objectId))
            : await (await fetch(String(node.attrs?.src))).blob();
        canvas = await picture(blob, drawingMarks(node.attrs?.strokes));
      }
      const scale = Math.min(1, 600 / canvas.width, 800 / canvas.height);
      return [
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: png(canvas),
              transformation: {
                width: Math.round(canvas.width * scale),
                height: Math.round(canvas.height * scale),
              },
            }),
          ],
          spacing: { after: 180 },
        }),
      ];
    }
    if (node.type === "privateFile")
      return [
        new Paragraph({
          text: `Attachment: ${String(node.attrs?.label ?? "File")}`,
          spacing: { after: 160 },
        }),
      ];
    if (node.type === "table") {
      /* A percentage alone is a width Word honours and Pages, LibreOffice and
         Quick Look do not: with no grid they squeezed every column to one
         letter. 9026 twips is the text width of A4 at the default margins. */
      const columns = Math.max(
        1,
        ...(node.content ?? []).map((row) =>
          (row.content ?? []).reduce((sum, cell) => sum + Number(cell.attrs?.colspan ?? 1), 0),
        ),
      );
      const column = Math.floor(9026 / columns);
      const rows = await Promise.all(
        (node.content ?? []).map(
          async (row) =>
            new TableRow({
              children: await Promise.all(
                (row.content ?? []).map(
                  async (cell) =>
                    new TableCell({
                      children: (
                        await Promise.all((cell.content ?? []).map((child) => blocks(child)))
                      ).flat(),
                      columnSpan: Number(cell.attrs?.colspan ?? 1),
                      width: {
                        size: column * Number(cell.attrs?.colspan ?? 1),
                        type: WidthType.DXA,
                      },
                      rowSpan: Number(cell.attrs?.rowspan ?? 1),
                    }),
                ),
              ),
            }),
        ),
      );
      return [
        new Table({
          rows,
          width: { size: 9026, type: WidthType.DXA },
          columnWidths: Array(columns).fill(column),
        }),
      ];
    }
    if (node.type === "caption")
      return [
        new Paragraph({
          children: inline(node),
          style: "Caption",
          spacing: { after: 140 },
        }),
      ];
    if (["paragraph", "heading", "codeBlock"].includes(node.type ?? ""))
      return [
        new Paragraph({
          children: [
            ...(prefix ? [new TextRun(prefix)] : []),
            ...inline(node, node.type === "codeBlock"),
          ],
          spacing: { after: 140 },
          ...(node.type === "heading"
            ? {
                heading:
                  ({ 1: "Heading1", 2: "Heading2", 3: "Heading3" } as const)[
                    Number(node.attrs?.level) as 1 | 2 | 3
                  ] ?? "Heading3",
              }
            : {}),
        }),
      ];
    if (["bulletList", "orderedList", "taskList"].includes(node.type ?? "")) {
      const result: Block[] = [];
      let index = Number(node.attrs?.start ?? 1);
      for (const item of node.content ?? []) {
        const label =
          node.type === "orderedList"
            ? `${index++}. `
            : node.type === "taskList"
              ? item.attrs?.checked
                ? "☑ "
                : "☐ "
              : "• ";
        let first = true;
        for (const child of item.content ?? []) {
          result.push(...(await blocks(child, first ? label : "")));
          first = false;
        }
      }
      return result;
    }
    if (node.type === "horizontalRule")
      return [new Paragraph({ text: "────────────────────────", spacing: { after: 140 } })];
    return (await Promise.all((node.content ?? []).map((child) => blocks(child)))).flat();
  }
  const children = [new Paragraph({ text: title, heading: "Title" }), ...(await blocks(content))];
  return Packer.toBlob(
    new Document({
      title,
      styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
      footnotes,
      sections: [{ children }],
    }),
  );
}

/** Render a clean, self-contained copy; the live editor is never modified. */
export async function exportPdf(title: string, source: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  const root = document.createElement("div");
  const rootWidth = Math.max(400, source.clientWidth);
  // The bottom padding is room for the last line's descenders; see the breaks below.
  root.style.cssText = `width:${rootWidth}px;background:#fff;color:#202020;padding:0 0 16px;`;
  const heading = document.createElement("h1");
  heading.textContent = title;
  heading.style.cssText = "font: bold 28px Arial;margin:0 0 24px;color:#202020";
  root.append(heading);
  const clone = source.cloneNode(true) as HTMLElement;
  const originals = [source, ...Array.from(source.querySelectorAll<HTMLElement>("*"))];
  const copies = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
  const properties = [
    "display",
    "position",
    "width",
    "height",
    "max-width",
    "max-height",
    "padding",
    "margin",
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "line-height",
    "text-decoration",
    "text-align",
    "white-space",
    "border-radius",
    "border-collapse",
    "vertical-align",
    "list-style-type",
    "inset",
    "object-fit",
    "overflow",
  ];
  originals.forEach((original, index) => {
    const copy = copies[index];
    const computed = getComputedStyle(original);
    copy.removeAttribute("class");
    copy.removeAttribute("style");
    copy.removeAttribute("contenteditable");
    for (const property of properties)
      copy.style.setProperty(property, computed.getPropertyValue(property));
    copy.style.color = "#202020";
    copy.style.background = "transparent";
    copy.style.boxShadow = "none";
    copy.style.borderColor = "#ccc";
    if (
      original.matches(
        ".rich-media-remove,.rich-media-drawing-tools,.drawing-overlay-tools,.ink-delete-menu,.ProseMirror-gapcursor",
      )
    )
      copy.remove();
    if (original instanceof HTMLVideoElement) {
      const label = document.createElement("div");
      label.textContent = "Video attachment";
      label.style.cssText = `height:${original.clientHeight}px;display:flex;align-items:center;justify-content:center;background:#eee;color:#222`;
      copy.replaceWith(label);
    }
    if (
      original instanceof SVGSVGElement &&
      original.matches(".rich-media-image-ink,.drawing-overlay-surface,.rich-media-drawing-surface")
    ) {
      const svg = original.cloneNode(true) as SVGSVGElement;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(original.clientWidth));
      svg.setAttribute("height", String(original.clientHeight));
      const img = document.createElement("img");
      img.style.cssText = copy.style.cssText;
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
      copy.replaceWith(img);
    }
  });
  clone.style.position = "relative";
  clone.style.height = "auto";
  clone.style.minHeight = "0";
  clone.style.paddingBottom = "0";
  clone.style.margin = "0";
  clone.style.width = "100%";
  root.append(clone);
  /* Laid out in a document of its own, with no stylesheet but the fonts.
     Measured in this page, the copy still answered to every global rule on
     `p`, `li` and `ul`, while html2canvas drew it without them — so the page
     breaks were worked out on one layout and cut through the lines of
     another. */
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${rootWidth}px;height:100px;border:0`;
  document.body.append(frame);
  const doc = frame.contentDocument!;
  const fonts = doc.createElement("style");
  fonts.textContent = Array.from(document.styleSheets)
    .flatMap((sheet) => {
      try {
        return Array.from(sheet.cssRules)
          .filter((rule) => rule.type === CSSRule.FONT_FACE_RULE)
          .map((rule) => rule.cssText);
      } catch {
        return [];
      }
    })
    .join("\n");
  doc.head.append(fonts);
  doc.body.style.margin = "0";
  doc.body.append(root);
  try {
    root.getBoundingClientRect(); // a layout, so the faces it uses start loading
    await doc.fonts.ready;
    await Promise.all(Array.from(root.querySelectorAll("img")).map((img) => img.decode()));
    frame.style.height = `${root.scrollHeight}px`;
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const width = 170,
      pageHeight = 257;
    const scale = width / root.clientWidth;
    const pagePixels = pageHeight / scale;
    const bounds = root.getBoundingClientRect();
    /* A page ends in the gap between two lines (or a line and a picture),
       halfway across it: html2canvas sets the glyphs a few pixels off the box
       the range reports, so a cut on the box's edge still clips a descender. */
    const boxes: [number, number][] = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const range = doc.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects()) boxes.push([rect.top, rect.bottom]);
    }
    for (const img of root.querySelectorAll("img")) {
      const rect = img.getBoundingClientRect();
      boxes.push([rect.top, rect.bottom]);
    }
    boxes.sort((a, b) => a[0] - b[0]);
    const breaks = new Set<number>([root.scrollHeight]);
    let reached = -Infinity;
    for (const [boxTop, boxBottom] of boxes) {
      if (boxTop >= reached && reached > -Infinity)
        breaks.add(Math.round((reached + boxTop) / 2 - bounds.top));
      reached = Math.max(reached, boxBottom);
    }
    const ordered = [...breaks].sort((a, b) => a - b);
    let top = 0;
    while (top < root.scrollHeight) {
      const limit = Math.min(root.scrollHeight, top + pagePixels);
      const end = ordered.filter((value) => value > top + 20 && value <= limit).at(-1) ?? limit;
      const canvas = await html2canvas(root, {
        backgroundColor: "#ffffff",
        scale: 2,
        y: top,
        height: end - top,
        logging: false,
      });
      if (top) pdf.addPage();
      pdf.addImage(canvas, "PNG", 20, 20, width, (end - top) * scale);
      top = end;
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}

export async function saveNoteExport(
  format: "pdf" | "docx",
  title: string,
  content: JSONContent,
  element: HTMLElement,
  resolve: Resolve,
): Promise<void> {
  const name = exportFileName(title).replace(/\.md$/, `.${format}`);
  const { savePdf } = platform();
  if (format === "pdf" && savePdf) return savePdf(name);
  const blob =
    format === "docx" ? await exportDocx(title, content, resolve) : await exportPdf(title, element);
  await platform().saveFile(name, blob);
}
