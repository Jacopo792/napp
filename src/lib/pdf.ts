import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const MAX_PAGES = 200;

export async function extractPdfText(
  file: File,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Choose a PDF file");
  }
  if (file.size > MAX_PDF_BYTES) throw new Error("PDF is larger than 30 MB");

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
