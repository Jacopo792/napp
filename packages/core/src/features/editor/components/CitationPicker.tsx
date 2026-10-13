/* Zotero's "Add citation", cut to one list: every source in the library,
 * filtered by what is typed — author, year, title or key — with a field for
 * the page. A library is filled from a file, BibTeX or Zotero's CSL-JSON,
 * from the foot of the same list, so the first citation is never a trip to
 * Settings. */
import { useEffect, useMemo, useRef, useState } from "react";
import { importSources, useReferences } from "@/lib/documentContents";
import { citationText, yearOf, type Source } from "@/lib/citations";
import { fold } from "@/lib/format";

const who = (source: Source) =>
  (source.author ?? source.editor ?? [])
    .map((name) => name.literal ?? name.family ?? "")
    .join(", ");

export function CitationPicker({
  onPick,
  onClose,
}: {
  onPick: (key: string, locator: string | null, label: string) => void;
  onClose: () => void;
}) {
  const { citing } = useReferences();
  const [query, setQuery] = useState("");
  const [locator, setLocator] = useState("");
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const q = fold(query.trim());
    return [...citing.sources.values()].filter(
      (source) =>
        !q ||
        fold(`${source.id} ${who(source)} ${yearOf(source) ?? ""} ${source.title ?? ""}`).includes(
          q,
        ),
    );
  }, [citing.sources, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>(`[data-row="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (index: number) => {
    const source = rows[index];
    if (!source) return;
    const at = locator.trim() || null;
    onPick(source.id, at, citationText(source.id, at, citing));
  };

  const keys = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((now) => Math.min(rows.length - 1, now + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((now) => Math.max(0, now - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(active);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="popover ribbon-panel xref-picker" role="dialog" aria-label="Citation">
      <div className="cite-fields">
        <input
          autoFocus
          className="xref-search"
          placeholder="Find an author, title or year"
          aria-label="Find a source"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={keys}
        />
        <input
          className="xref-search cite-locator"
          placeholder="Page"
          aria-label="Page"
          value={locator}
          onChange={(event) => setLocator(event.target.value)}
          onKeyDown={keys}
        />
      </div>
      <div ref={list} className="xref-list" role="listbox" aria-label="Sources">
        {rows.length === 0 && (
          <p className="xref-empty">
            {citing.sources.size ? "No source matches" : "No sources yet"}
          </p>
        )}
        {rows.map((source, index) => (
          <button
            key={source.id}
            type="button"
            role="option"
            data-row={index}
            aria-selected={index === active}
            className={`menu-row xref-row ${index === active ? "is-active" : ""}`}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setActive(index)}
            onClick={() => pick(index)}
          >
            <span className="xref-number readout">{yearOf(source) ?? "—"}</span>
            <span className="xref-text">{source.title ?? source.id}</span>
            <span className="xref-where text-ink-4">{who(source) || source.id}</span>
          </button>
        ))}
      </div>
      <div className="cite-foot">
        <button
          type="button"
          className="menu-row"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => file.current?.click()}
        >
          Import BibTeX or CSL-JSON…
        </button>
        {status && <span className="cite-status text-ink-3">{status}</span>}
        <input
          ref={file}
          type="file"
          accept=".bib,.bibtex,.json,application/json"
          hidden
          onChange={async (event) => {
            const chosen = event.target.files?.[0];
            event.target.value = "";
            if (!chosen) return;
            setStatus("Importing…");
            try {
              const count = await importSources(await chosen.text());
              setStatus(`${count} ${count === 1 ? "source" : "sources"} imported`);
            } catch (error) {
              setStatus(error instanceof Error ? error.message : "Could not import that file");
            }
          }}
        />
      </div>
    </div>
  );
}
