import { useEffect, useRef, useState } from "react";
import { FolderInput } from "@/components/icons";
import { Sheet, SheetStack } from "@/components/Sheet";
import { landInList } from "@/lib/motion";
import type { DriveImportFile } from "@/platform";

interface Props {
  destination: string;
  members: string[];
  prepare: () => Promise<(signal: AbortSignal) => Promise<DriveImportFile[]>>;
  /** Resolves with the new note's id. */
  importFile: (file: DriveImportFile, signal: AbortSignal) => Promise<string>;
  onClose: () => void;
}

export function GoogleDriveImport({ destination, members, prepare, importFile, onClose }: Props) {
  const controller = useRef<AbortController | null>(null);
  const [chooser, setChooser] = useState<Awaited<ReturnType<Props["prepare"]>> | null>(null);
  const [phase, setPhase] = useState<
    "loading" | "choose" | "picking" | "confirm" | "import" | "done"
  >("loading");
  const [files, setFiles] = useState<DriveImportFile[]>([]);
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<{ name: string; message: string }[]>([]);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(-1);
  const [closing, setClosing] = useState(false);
  const list = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const lifetime = new AbortController();
    controller.current = lifetime;
    void prepare().then(
      (pick) => {
        if (lifetime.signal.aborted) return;
        setChooser(() => pick);
        setPhase("choose");
      },
      (reason: Error) => {
        if (lifetime.signal.aborted) return;
        setError(reason.message);
        setPhase("choose");
      },
    );
    return () => lifetime.abort();
  }, [prepare]);

  async function choose() {
    const signal = controller.current?.signal;
    if (!chooser || !signal) return;
    setPhase("picking");
    setError("");
    try {
      const selected = await chooser(signal);
      if (signal.aborted) return;
      setFiles(selected);
      setPhase(selected.length ? "confirm" : "choose");
    } catch (reason) {
      if (signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Could not open Google Drive.");
      setPhase("choose");
    }
  }

  async function runImport() {
    const signal = controller.current?.signal;
    if (!signal) return;
    // Rows leave for the list; the sheet keeps its height rather than jumping.
    if (list.current) list.current.style.minHeight = `${list.current.offsetHeight}px`;
    setPhase("import");
    const failed: typeof failures = [];
    const landings: Promise<void>[] = [];
    for (const [index, file] of files.entries()) {
      if (signal.aborted) return;
      setCurrent(index);
      try {
        const noteId = await importFile(file, signal);
        const row = list.current?.querySelector<HTMLElement>(`[data-drive-row="${index}"]`);
        if (row) landings.push(landInList(row, noteId));
      } catch (reason) {
        if (signal.aborted) return;
        failed.push({
          name: file.name,
          message: reason instanceof Error ? reason.message : "Could not import this file.",
        });
      }
      if (signal.aborted) return;
      setProgress(index + 1);
    }
    // The last rows are still on their way to the list.
    await Promise.all(landings);
    if (signal.aborted) return;
    setFailures(failed);
    // Download functions retain the Google access token. Release them after the batch.
    setFiles([]);
    setPhase("done");
    if (failed.length === 0) setClosing(true);
  }

  return (
    <SheetStack onBack={onClose} onClose={onClose}>
      <Sheet
        label="Import from Google Drive"
        className="is-short max-h-[calc(100dvh-32px)]"
        dismissible={phase !== "import"}
        closing={closing}
      >
        <div className="sheet-body is-plain">
          <header className="sheet-hero">
            <span className="sheet-portrait sheet-note-glyph" aria-hidden="true">
              <FolderInput size={24} />
            </span>
            <h2>Import from Google Drive</h2>
            <p className="break-words">{destination}</p>
          </header>
          <div className="sheet-work">
            {phase === "choose" && !error && (
              <p className="text-sm text-ink-2">
                Google Docs become editable notes. Sheets, Slides and PDFs become PDF attachments.
              </p>
            )}
            {phase === "confirm" && (
              <p className="text-sm text-ink-2">
                {members.length
                  ? `Members with access to these copies: you, ${members.join(", ")}.`
                  : "You’re the only member of this group."}
              </p>
            )}
            {(phase === "confirm" || phase === "import") && (
              <ul
                ref={list}
                aria-label="Selected files"
                className="sheet-day max-h-[min(11rem,28dvh)] overflow-auto"
              >
                {files.map((file, index) => (
                  <li key={index} data-drive-row={index} className="sheet-entry">
                    <div className="sheet-row">
                      <span className="sheet-row-title" title={file.name}>
                        {file.name}
                      </span>
                      <span className="sheet-row-meta">
                        {phase === "import" && index === current
                          ? "Importing…"
                          : phase === "import" && index > current
                            ? "Waiting"
                            : file.format === "pdf"
                              ? "PDF attachment"
                              : "Editable note"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {phase === "loading" && (
              <p role="status" className="text-sm">
                Loading Google Drive…
              </p>
            )}
            {phase === "picking" && (
              <p role="status" className="text-sm">
                Choose files in your browser…
              </p>
            )}
            {phase === "import" && (
              <p role="status" className="mt-3 text-sm">
                Importing {Math.min(progress + 1, files.length)} of {files.length} files…
              </p>
            )}
            {phase === "done" && (
              <>
                <p role="status" className="text-sm">
                  Imported {progress - failures.length} of {progress} files.
                </p>
                {failures.length > 0 && (
                  <ul
                    aria-label="Files that failed"
                    className="mt-2 max-h-[min(11rem,28dvh)] space-y-2 overflow-auto text-sm text-danger"
                  >
                    {failures.map((file, index) => (
                      <li key={index} className="break-words">
                        {file.name} · {file.message}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {error && (
              <p role="alert" className="sheet-quiet is-failure">
                {error}
              </p>
            )}
            {phase === "choose" && chooser && (
              <button
                type="button"
                className="sheet-primary-action press mt-4"
                onClick={() => void choose()}
              >
                Choose files
              </button>
            )}
            {phase === "confirm" && (
              <button
                type="button"
                className="sheet-primary-action press mt-4"
                onClick={() => void runImport()}
              >
                Import {files.length} {files.length === 1 ? "file" : "files"}
              </button>
            )}
          </div>
        </div>
      </Sheet>
    </SheetStack>
  );
}
