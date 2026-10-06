/* A table of contents: parts, chapters and the headings in them, each one a
 * door to its place. Drawn on the title page and by a `[TOC]` block in the
 * text, from the same entries, so the two cannot disagree. */
import type { ContentsEntry } from "@/lib/manuscript";

export function ContentsList({
  entries,
  onOpen,
}: {
  entries: ContentsEntry[];
  onOpen: (noteId: string, heading?: string) => void;
}) {
  const chapters = entries.filter((entry) => entry.kind === "chapter");
  return (
    <nav className="toc" aria-label="Contents">
      <p className="toc-title">Contents</p>
      {chapters.length === 0 ? (
        <p className="toc-empty">No chapters yet</p>
      ) : (
        <ol>
          {entries.map((entry) =>
            entry.kind === "part" ? (
              <li key={`part:${entry.id}`} className="toc-part">
                {entry.title}
              </li>
            ) : (
              <li key={entry.id} className="toc-chapter">
                <button type="button" onClick={() => onOpen(entry.id)}>
                  {entry.number !== null && <span className="toc-number">{entry.number}</span>}
                  <span>{entry.title || "Untitled"}</span>
                </button>
                {entry.headings.length > 0 && (
                  <ol>
                    {entry.headings.map((heading, index) => (
                      <li key={index} data-level={heading.depth}>
                        <button type="button" onClick={() => onOpen(entry.id, heading.text)}>
                          {heading.number && <span className="toc-number">{heading.number}</span>}
                          <span>{heading.text}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ),
          )}
        </ol>
      )}
    </nav>
  );
}
