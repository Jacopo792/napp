import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 200;

/* ── Safari and `for await (… of stream)` ────────────────────────────────────
   pdf.js reads a page's text with `for await (const value of readableStream)`.
   Async iteration over a ReadableStream is standard, and every browser but
   Safari implements it; in Safari `stream[Symbol.asyncIterator]` is simply
   absent, so the loop throws

     undefined is not a function (near '...value of readableStream...')

   and importing a PDF fails on the first page with a message that names none
   of this. The protocol is small and entirely public — get a reader, read until
   done, cancel on early exit — so it is filled in here rather than pulling in
   the legacy pdf.js build for one missing method. */
function allowStreamIteration(): void {
  if (typeof ReadableStream === "undefined") return;
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
  if (typeof proto[Symbol.asyncIterator] === "function") return;

  proto[Symbol.asyncIterator] = function asyncIterator(this: ReadableStream<unknown>) {
    const reader = this.getReader();
    return {
      async next() {
        const { done, value } = await reader.read();
        if (done) {
          reader.releaseLock();
          return { done: true as const, value: undefined };
        }
        return { done: false as const, value };
      },
      async return(value?: unknown) {
        await reader.cancel();
        reader.releaseLock();
        return { done: true as const, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
}

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a PDF file");
  }
  if (file.size > MAX_PDF_BYTES) throw new Error("PDF is larger than 30 MB");

  allowStreamIteration();

  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;

  try {
    if (pdf.numPages > MAX_PAGES) throw new Error(`PDF has more than ${MAX_PAGES} pages`);

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      onProgress?.(pageNumber, pdf.numPages);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => {
          if (!("str" in item)) return "";
          return `${item.str}${item.hasEOL ? "\n" : " "}`;
        })
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

      if (text) pages.push(pdf.numPages > 1 ? `## Page ${pageNumber}\n\n${text}` : text);
    }

    if (pages.length === 0) {
      throw new Error("No selectable text found. Scanned PDFs need OCR, which is not included");
    }

    const title = file.name.replace(/\.pdf$/i, "");
    return `# ${title}\n\n${pages.join("\n\n")}`;
  } finally {
    await loadingTask.destroy();
  }
}
