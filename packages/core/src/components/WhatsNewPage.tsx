/* What's New: every release, newest first, in the words of somebody using
 * Napp — a page of Settings, not a window of its own. Each release is one row
 * that opens like Fine-tune; the newest is open. A release not read when the
 * page opened says "New" — only the newest, for somebody who has never opened
 * it, to whom all history is new. It opens by itself once after an update. */
import { useEffect, useState } from "react";
import { ChevronRight } from "@/components/icons";
import { DOWNLOADS, RELEASES, compareVersions, releaseDate } from "@/lib/whatsNew";

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

export function WhatsNewPage({
  seen,
  onRead,
}: {
  /** The last release read before this opening, so "New" stays on what was
   *  new when the page opened rather than vanishing as it is read. */
  seen: string;
  /** Opening the page is reading it. */
  onRead: () => void;
}) {
  const [wasSeen] = useState(seen);
  useEffect(onRead, [onRead]);
  const [open, setOpen] = useState(() => new Set([RELEASES[0].version]));
  const toggle = (version: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(version)) next.add(version);
      return next;
    });

  return (
    <section className="whats-new-page">
      {/* The installers, from the page that says what is in them: the newest
          release on GitHub, whichever release is open. */}
      <div className="appearance-controls">
        <div className="appearance-row">
          <span className="settings-label">
            <b>Download</b>
          </span>
          <span className="whats-new-downloads">
            <a href={DOWNLOADS.mac} target="_blank" rel="noreferrer">
              Mac
            </a>
            <a href={DOWNLOADS.windows} target="_blank" rel="noreferrer">
              Windows
            </a>
            <a href={DOWNLOADS.macIntel} target="_blank" rel="noreferrer">
              Intel Mac
            </a>
          </span>
        </div>
      </div>

      {RELEASES.map((release) => {
        const isOpen = open.has(release.version);
        const isNew = wasSeen
          ? compareVersions(release.version, wasSeen) > 0
          : release === RELEASES[0];
        return (
          <div key={release.version} className="whats-new-release">
            <button
              type="button"
              className={`settings-disclosure press ${isOpen ? "is-open" : ""}`}
              aria-expanded={isOpen}
              onClick={() => toggle(release.version)}
            >
              <ChevronRight size={16} />
              <span className="whats-new-version">{release.version}</span>
              <span className="whats-new-headline">{release.headline}</span>
              {isNew && <span className="whats-new-badge">New</span>}
              <small>{releaseDate(release.date)}</small>
            </button>
            {isOpen &&
              release.sections.map((section) => (
                <div key={section.heading} className="whats-new-section">
                  <h3>{section.heading}</h3>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.title}>
                        <b>{item.title}</b>
                        <span>{item.text}</span>
                        {item.image && PICTURES[item.image] && (
                          <img src={PICTURES[item.image]} alt="" loading="lazy" decoding="async" />
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        );
      })}
    </section>
  );
}
