import { type NoteEntry } from "@/lib/entries";
import { loadMediaText, saveMediaText, subscribeMediaText } from "@/lib/mediaText";
import { readableMedia } from "@/lib/mediaTextShape";
import { type AppSession } from "@/lib/session";
import type { JSONContent } from "@tiptap/core";
import { useEffect, useRef, useState } from "react";
interface IndexRequest {
  entries: NoteEntry[];
  contentOf: (entry: NoteEntry) => JSONContent;
  canWriteArchive: boolean;
  resolveFile: (id: string) => Promise<Blob>;
  resolveImage: (id: string) => Promise<Blob>;
}
/** Attachment text and the recognizer share the archive's subscription lifetime. */
export function useMediaIndexing(
  session: AppSession | null,
  setError: (message: string) => void,
  setStatusFlash: (message: string) => void,
) {
  const [mediaTexts, setMediaTexts] = useState<Map<string, string>>(new Map());
  const [indexingMedia, setIndexingMedia] = useState(false);
  const indexingAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const read = () => {
      void loadMediaText(session)
        .then((rows) => {
          if (live) setMediaTexts(rows);
        })
        .catch((reason) => {
          if (live)
            setError(reason instanceof Error ? reason.message : "Could not read attachment text");
        });
    };
    read();
    const stop = subscribeMediaText(session, read);
    return () => {
      live = false;
      indexingAbort.current?.abort();
      stop();
    };
  }, [session, setError]);

  const indexMedia = async ({
    entries,
    contentOf,
    canWriteArchive,
    resolveFile,
    resolveImage,
  }: IndexRequest) => {
    if (!session || !canWriteArchive || indexingMedia) return;
    const controller = new AbortController();
    indexingAbort.current = controller;
    const media = new Map(
      entries
        .flatMap((entry) => readableMedia(contentOf(entry)))
        .filter((one) => !mediaTexts.has(one.id))
        .map((one) => [one.id, one]),
    );
    if (!media.size) {
      setStatusFlash("Images and PDFs are searchable");
      return;
    }
    setIndexingMedia(true);
    setError("");
    let recognizer:
      | Awaited<ReturnType<typeof import("@/features/editor/lib/ocr").textRecognizer>>
      | undefined;
    try {
      let done = 0;
      for (const one of media.values()) {
        if (controller.signal.aborted) break;
        setStatusFlash(`Reading images and PDFs… ${done + 1}/${media.size}`);
        const blob = one.type === "pdf" ? await resolveFile(one.id) : await resolveImage(one.id);
        if (controller.signal.aborted) break;
        const read = async (input: Blob | HTMLCanvasElement) => {
          recognizer ??= await (await import("@/features/editor/lib/ocr")).textRecognizer();
          return recognizer.read(input);
        };
        const text =
          one.type === "pdf"
            ? await (
                await import("@/features/editor/lib/pdf")
              ).extractPdfText(
                new File([blob], one.label, { type: "application/pdf" }),
                undefined,
                read,
              )
            : await read(blob);
        if (controller.signal.aborted) break;
        await saveMediaText(session, one.id, text);
        if (!controller.signal.aborted) setMediaTexts((rows) => new Map(rows).set(one.id, text));
        done += 1;
      }
      if (!controller.signal.aborted) setStatusFlash("Images and PDFs are searchable");
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : "Could not read attachment text");
    } finally {
      await recognizer?.close();
      if (!controller.signal.aborted) setIndexingMedia(false);
    }
  };

  return { mediaTexts, indexingMedia, indexMedia };
}
