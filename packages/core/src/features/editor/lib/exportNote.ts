import type { JSONContent } from "@tiptap/core";
import { drawingStrokes, drawingSvg, type DrawingStroke } from "./content";
import { platform } from "@/platform";

type Resolve = (id: string) => Promise<Blob>;
function png(canvas: HTMLCanvasElement): Uint8Array {
  return Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]), (c) => c.charCodeAt(0));
}
async function picture(blob: Blob, strokes: DrawingStroke[] = []): Promise<HTMLCanvasElement> {
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
    for (const stroke of strokes) {
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke(new Path2D(stroke.d));
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
    WidthType,
  } = await import("docx");
  const inline = (
    node: JSONContent,
  ): (InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>)[] =>
    (node.content ?? []).flatMap((child) => {
      if (child.type === "hardBreak") return [new TextRun({ break: 1 })];
      if (child.type !== "text") return inline(child);
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
          new Blob([drawingSvg(drawingStrokes(node.attrs?.strokes), node.attrs?.surface)], {
            type: "image/svg+xml",
          }),
        );
      else {
        const blob =
          node.type === "privateImage"
            ? await resolve(String(node.attrs?.objectId))
            : await (await fetch(String(node.attrs?.src))).blob();
        canvas = await picture(blob, drawingStrokes(node.attrs?.strokes));
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
                      rowSpan: Number(cell.attrs?.rowspan ?? 1),
                    }),
                ),
              ),
            }),
        ),
      );
      return [new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } })];
    }
    if (["paragraph", "heading", "codeBlock"].includes(node.type ?? ""))
      return [
        new Paragraph({
          children: [...(prefix ? [new TextRun(prefix)] : []), ...inline(node)],
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
  return Packer.toBlob(
    new Document({
      title,
      styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
      sections: [
        {
          children: [new Paragraph({ text: title, heading: "Title" }), ...(await blocks(content))],
        },
      ],
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
  root.style.cssText = `position:fixed;left:-20000px;top:0;width:${Math.max(400, source.clientWidth)}px;background:#fff;color:#202020;padding:0;`;
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
  document.body.append(root);
  try {
    await Promise.all(Array.from(root.querySelectorAll("img")).map((img) => img.decode()));
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const width = 170,
      pageHeight = 257;
    const scale = width / root.clientWidth;
    const pagePixels = pageHeight / scale;
    const bounds = root.getBoundingClientRect();
    const breaks = new Set<number>([root.scrollHeight]);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      for (const rect of range.getClientRects())
        breaks.add(Math.ceil(rect.bottom - bounds.top + 3));
    }
    for (const img of root.querySelectorAll("img")) {
      const rect = img.getBoundingClientRect();
      breaks.add(Math.ceil(rect.bottom - bounds.top));
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
        onclone(doc) {
          for (const sheet of Array.from(doc.querySelectorAll('style,link[rel="stylesheet"]')))
            sheet.remove();
        },
      });
      if (top) pdf.addPage();
      pdf.addImage(canvas, "PNG", 20, 20, width, (end - top) * scale);
      top = end;
    }
    return pdf.output("blob");
  } finally {
    root.remove();
  }
}

export async function saveNoteExport(
  format: "pdf" | "docx",
  title: string,
  content: JSONContent,
  element: HTMLElement,
  resolve: Resolve,
): Promise<void> {
  const blob =
    format === "docx" ? await exportDocx(title, content, resolve) : await exportPdf(title, element);
  await platform().saveFile(
    `${(title || "Untitled").replace(/[\\/:*?"<>|]/g, "-")}.${format}`,
    blob,
  );
}
