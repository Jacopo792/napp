import { parseSources } from "@/lib/citations";
import {
  setDocumentContents,
  setDocumentReferences,
  setDocumentSources,
  setSourceImporter,
} from "@/lib/documentContents";
import { type NoteEntry } from "@/lib/entries";
import { contentsOf, manuscriptOf } from "@/lib/manuscript";
import { EMPTY_TARGETS, targetsOf, type ChapterTargets } from "@/lib/references";
import { type AppSession } from "@/lib/session";
import { loadSources, saveSources } from "@/lib/spaces";
import { type DocumentFeatures, type PageSetup } from "@/lib/spaceShape";
import { headingsOf } from "@/lib/spotlight";
import { useEffect, useMemo } from "react";
const targetCache = new WeakMap<object, ChapterTargets>();
interface DocumentReferenceOptions {
  manuscript: ReturnType<typeof manuscriptOf> | null;
  entries: NoteEntry[];
  docFeatures: DocumentFeatures;
  page: PageSetup;
  docMode: boolean;
  session: AppSession | null;
}
/** Publish manuscript projections to editor nodes and own the bibliography importer lifetime. */
export function useDocumentReferences({
  manuscript,
  entries,
  docFeatures,
  page,
  docMode,
  session,
}: DocumentReferenceOptions) {
  /* The table of contents, from the same rows the structure draws, with each
     chapter's headings read out of its document. Handed to the `[TOC]` block
     through `documentContents.ts`, because the block is drawn inside the
     editor where nothing from here reaches it as a prop. */
  const contents = useMemo(() => {
    if (!manuscript) return [];
    const byId = new Map(entries.map((entry) => [entry.note.id, entry.note]));
    return contentsOf(
      manuscript.rows,
      manuscript.parts,
      (id) => headingsOf(byId.get(id)?.content),
      docFeatures.numbering,
    );
  }, [manuscript, entries, docFeatures.numbering]);
  useEffect(() => setDocumentContents(contents), [contents]);

  /* Every chapter's footnotes, captions and cited headings, from the same
     projections, in the structure's order — what a cross-reference's words,
     a sheet's first footnote number and the picker are counted from. The
     notebook is there too, counted on its own, so a page of it can cite
     and be cited like a chapter. */
  const referenceChapters = useMemo(() => {
    if (!manuscript) return [];
    const byId = new Map(entries.map((entry) => [entry.note.id, entry.note]));
    const read = (id: string): ChapterTargets => {
      const content = byId.get(id)?.content;
      if (!content || typeof content !== "object") return EMPTY_TARGETS;
      let found = targetCache.get(content);
      if (!found) targetCache.set(content, (found = targetsOf(content)));
      return found;
    };
    return [
      ...manuscript.chapters.map((item, index) => ({
        id: item.id,
        title: item.title,
        number: index + 1,
        targets: read(item.id),
      })),
      ...manuscript.notebook.map((item) => ({
        id: item.id,
        title: item.title,
        number: null,
        targets: read(item.id),
      })),
    ];
  }, [manuscript, entries]);
  useEffect(
    () =>
      setDocumentReferences(referenceChapters, {
        numbered: docFeatures.numbering,
        footnotes: page.footnoteNumbering,
        language: page.labels,
        citations: page.citationStyle,
      }),
    [
      referenceChapters,
      docFeatures.numbering,
      page.footnoteNumbering,
      page.labels,
      page.citationStyle,
    ],
  );

  /* The library, read when a document that cites opens, and taken in from a
     file through the picker. Read again after an import rather than merged
     here, so what is shown is what the table holds. */
  const citingArchive = docMode && docFeatures.citations ? session?.archiveId : undefined;
  useEffect(() => {
    if (!citingArchive || !session) return;
    let current = true;
    const read = () =>
      loadSources(session).then((sources) => {
        if (current) setDocumentSources(sources);
      });
    read().catch((error) => console.warn("Could not read the sources", error));
    setSourceImporter(async (text) => {
      const sources = parseSources(text);
      if (!sources.length) throw new Error("No BibTeX or CSL-JSON entries in that file");
      await saveSources(session, sources);
      await read();
      return sources.length;
    });
    return () => {
      current = false;
      setSourceImporter(null);
      setDocumentSources([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the archive, not the session object, decides
  }, [citingArchive]);

  return contents;
}
