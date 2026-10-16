/* What's New: every release, newest first, in the words of somebody using
 * Napp. It opens by itself once after an update — on the newest release —
 * and is always in the sidebar and in ⌘K. The versions down the side are
 * the whole history; a release not read yet says "New" — only the newest,
 * for somebody who has never opened it, to whom all history is new.
 *
 * Closing it, any way at all, is having read it: a sheet that has to be
 * dismissed twice is a sheet people learn to dismiss without reading. */
import { useEffect, useState } from "react";
import { Download, Sparkle, X } from "@/components/icons";
import { DOWNLOADS, RELEASES, compareVersions, releaseDate } from "@/lib/whatsNew";
import { emerge } from "@/lib/motion";

/* The pictures go into the bundle by name, so a release's entry needs no
   import of its own and a missing file is an empty slot, not a failed build. */
const PICTURES = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>("../assets/whats-new/*", {
      eager: true,
      query: "?url",
      import: "default",
    }),
  ).map(([path, url]) => [path.split("/").pop() ?? path, url]),
);

export function WhatsNewSheet({
  open,
  seen,
  onClose,
}: {
  open: boolean;
  /** The last release read before this opening, so "New" stays on what was
   *  new when the sheet opened rather than vanishing as it is read. */
  seen: string;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(RELEASES[0].version);
  const [wasSeen, setWasSeen] = useState(seen);
  /* Each opening starts on the newest release, with the reading it was
     opened with — set while rendering the change, as React asks, not in an
     effect a frame later. */
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setShown(RELEASES[0].version);
      setWasSeen(seen);
    }
  }

  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;
  const release = RELEASES.find((one) => one.version === shown) ?? RELEASES[0];

  return (
    <div className="palette-layer is-whats-new" role="presentation">
      <button type="button" aria-label="Close" className="settings-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="whats-new-title"
        className="palette whats-new glass-sheet"
        ref={arrive}
      >
        <header className="whats-new-head">
          <span className="whats-new-mark" aria-hidden="true">
            <Sparkle size={18} weight="fill" />
          </span>
          <div className="whats-new-heading">
            <h2 id="whats-new-title">What&rsquo;s New</h2>
            <p>
              Version {release.version} · {releaseDate(release.date)}
            </p>
          </div>
          <button
            type="button"
            className="whats-new-close press"
            aria-label="Close What's New"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </header>

        <div className="whats-new-body">
          <nav className="whats-new-versions" aria-label="Versions">
            {RELEASES.map((one) => (
              <button
                key={one.version}
                type="button"
                aria-current={one.version === release.version ? "true" : undefined}
                className={`whats-new-version press ${one.version === release.version ? "is-current" : ""}`}
                onClick={() => setShown(one.version)}
              >
                <span>{one.version}</span>
                {(wasSeen ? compareVersions(one.version, wasSeen) > 0 : one === RELEASES[0]) && (
                  <span className="whats-new-badge">New</span>
                )}
              </button>
            ))}
          </nav>

          <article key={release.version} className="whats-new-release">
            <p className="whats-new-headline">{release.headline}</p>
            {release.sections.map((section) => (
              <section key={section.heading}>
                <h3>{section.heading}</h3>
                <ul>
                  {section.items.map((item) => (
                    <li key={item.title}>
                      <strong>{item.title}</strong>
                      <span>{item.text}</span>
                      {item.image && PICTURES[item.image] && (
                        <img src={PICTURES[item.image]} alt="" loading="lazy" decoding="async" />
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        </div>

        {/* The installers, from the same sheet that says what is in them: the
            newest release on GitHub, whichever page of the history is open. */}
        <footer className="whats-new-foot">
          <span className="whats-new-downloads">
            <a
              className="whats-new-download press"
              href={DOWNLOADS.mac}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={15} />
              Mac
            </a>
            <a
              className="whats-new-download press"
              href={DOWNLOADS.windows}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={15} />
              Windows
            </a>
            <a
              className="whats-new-download is-quiet press"
              href={DOWNLOADS.macIntel}
              target="_blank"
              rel="noreferrer"
            >
              Intel Mac
            </a>
          </span>
          <button type="button" className="whats-new-done press" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}

/* Out of the row that opened it — or, opened by itself after an update, from
   its own middle. Module-level so the ref is the same function every render
   and runs once, on the way in. */
const arrive = (el: HTMLElement | null) => emerge(el);
