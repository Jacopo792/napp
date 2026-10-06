/* Two keyboard surfaces, in one file because they are the same surface twice:
   a sheet that arrives over the window, is dismissed with Escape, and exists
   to be reached without the pointer. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "@/components/icons";
import { fold } from "@/lib/format";
import type { Snippet } from "@/lib/spotlight";
import { SHORTCUTS, shortcutGroups, keyName } from "@/lib/shortcuts";

export interface Command {
  id: string;
  /** The heading this sits under. Commands are grouped, never sorted flat. */
  group: string;
  name: string;
  /** A second line, and for a note it is the line the list shows. */
  hint?: string;
  icon: ReactNode;
  /** Words that should find this and are not in its name. */
  keywords?: string;
  /** Set by a search that has already decided how well this answers the
   *  query — a heading, a line of text. It is ranked as given. */
  rank?: number;
  /** When it last changed, in milliseconds: the last tiebreak. */
  at?: number;
  /** Found by a query, never listed at rest: a resting palette is where you
   *  were going, not an index of the archive. */
  searchOnly?: boolean;
  /** The words around the match, shown in place of the hint. */
  snippet?: Snippet;
  run: () => void;
}

/** How many of a group to show before the reader has typed anything. Without a
 *  cap the palette opens as the whole archive, which is the list they already
 *  have on screen. */
const RESTING_LIMIT = 5;

/* One scale for everything the palette holds, so a chapter, a heading and a
   line of text can be put in one order: the start of a name, the start of a
   word in it, anywhere in it, a heading (3, given by the search), the words
   behind a name, its second line, and last the running text (6). */
function score(command: Command, query: string): number {
  if (command.rank !== undefined) return command.rank;
  const name = fold(command.name);
  if (name.startsWith(query)) return 0;
  const word = name.split(/\s+/).some((part) => part.startsWith(query));
  if (word) return 1;
  if (name.includes(query)) return 2;
  if (command.keywords && fold(command.keywords).includes(query)) return 4;
  if (command.hint && fold(command.hint).includes(query)) return 5;
  return -1;
}

/** How many characters a query needs before other archives are asked. */
const REMOTE_FROM = 3;

export function CommandPalette({
  open,
  commands,
  initialQuery = "",
  search,
  remote,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  /** What only a typed query can find — headings and running text — already
   *  ranked. Asked on every keystroke, from memory. */
  search?: (query: string) => Command[];
  /** What is not in memory: asked once the reader has paused, and only for a
   *  query long enough to be worth a request. */
  remote?: (query: string) => Promise<Command[]>;
  /** What the field already holds when it opens. A menu item that means one
   *  group of the palette opens it standing in that group, rather than opening
   *  the whole thing and leaving the reader to guess the word. */
  initialQuery?: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const [far, setFar] = useState<{ query: string; items: Command[] }>({ query: "", items: [] });

  useEffect(() => {
    const q = fold(query.trim());
    if (!open || !remote || q.length < REMOTE_FROM) return;
    let current = true;
    const timer = window.setTimeout(() => {
      remote(query.trim())
        .then((items) => current && setFar({ query: q, items }))
        .catch(() => current && setFar({ query: q, items: [] }));
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [open, query, remote]);

  useEffect(() => {
    setQuery(open ? initialQuery : "");
    setCursor(0);
  }, [open, initialQuery]);

  /* At rest, grouped in the order the groups were handed over — the order of
     a resting palette is the caller's editorial decision. With a query, by
     how well each answers it, then by the kind of thing (the caller's order
     again), then by how recently it changed; and the groups follow their best
     row, so the heading that starts with the word is above the line of text
     that merely contains it. */
  const matches = useMemo(() => {
    const q = fold(query.trim());
    const pool = q
      ? [...commands, ...(search?.(q) ?? []), ...(far.query === q ? far.items : [])]
      : commands.filter((command) => !command.searchOnly);
    const order = new Map<string, number>();
    for (const command of pool) if (!order.has(command.group)) order.set(command.group, order.size);
    const ranked = q
      ? pool
          .map((command) => ({ command, rank: score(command, q) }))
          .filter((entry) => entry.rank >= 0)
          .sort(
            (a, b) =>
              a.rank - b.rank ||
              order.get(a.command.group)! - order.get(b.command.group)! ||
              (b.command.at ?? 0) - (a.command.at ?? 0),
          )
          .map((entry) => entry.command)
      : pool;

    const groups: { group: string; items: Command[] }[] = [];
    for (const command of ranked) {
      const bucket = groups.find((entry) => entry.group === command.group);
      if (bucket) bucket.items.push(command);
      else groups.push({ group: command.group, items: [command] });
    }
    return q ? groups : groups.map((g) => ({ ...g, items: g.items.slice(0, RESTING_LIMIT) }));
  }, [commands, search, far, query]);

  const flat = useMemo(() => matches.flatMap((group) => group.items), [matches]);
  const active = flat[Math.min(cursor, flat.length - 1)];

  useEffect(() => {
    setCursor(0);
  }, [query]);

  // Keep the cursor in view when the arrows walk it past the fold.
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(".is-active")?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  function choose(command: Command | undefined) {
    if (!command) return;
    onClose();
    command.run();
  }

  return (
    <div className="palette-layer" role="presentation">
      <button type="button" aria-label="Close" className="settings-scrim" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Commands" className="palette glass-sheet">
        <div className="palette-search">
          <Search size={16} />
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search everything…"
            aria-label="Search everything"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") return onClose();
              if (event.key === "Enter") {
                event.preventDefault();
                return choose(active);
              }
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setCursor((current) => Math.min(flat.length - 1, current + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setCursor((current) => Math.max(0, current - 1));
              }
            }}
          />
          <kbd>esc</kbd>
        </div>

        <div ref={list} className="palette-results">
          {flat.length === 0 && <p className="palette-empty">Nothing matches that.</p>}
          {matches.map((group) => (
            <div key={group.group} className="palette-group">
              <p className="palette-group-label">{group.group}</p>
              {group.items.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  className={`palette-row ${command === active ? "is-active" : ""}`}
                  /* The pointer moves the cursor rather than fighting it: one
                     selection, whichever hand is driving. */
                  onMouseMove={() => setCursor(flat.indexOf(command))}
                  onClick={() => choose(command)}
                >
                  <span className="palette-row-icon">{command.icon}</span>
                  <span className="min-w-0">
                    <b>{command.name}</b>
                    {command.snippet ? (
                      <small>
                        {command.snippet.before}
                        <mark>{command.snippet.match}</mark>
                        {command.snippet.after}
                      </small>
                    ) : (
                      command.hint && <small>{command.hint}</small>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* The `?` sheet: the same list Settings shows, over the window instead of
   inside a section, because the question "what were the keys again" is asked
   in the middle of doing something else. */
export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, onClose]);

  if (!open) return null;

  const groups = shortcutGroups();
  return (
    <div className="palette-layer is-shortcuts" role="presentation">
      <button type="button" aria-label="Close" className="settings-scrim" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="palette shortcut-sheet glass-sheet"
      >
        <header>
          <h2>Keyboard shortcuts</h2>
          <kbd>esc</kbd>
        </header>
        <div className="shortcut-columns">
          {groups.map((group) => (
            <section key={group}>
              <p className="palette-group-label">{group}</p>
              {SHORTCUTS.filter((entry) => entry.group === group).map((entry) => (
                <div key={`${entry.keys}-${entry.what}`} className="shortcut-row">
                  <span>{entry.what}</span>
                  <kbd>{keyName(entry.keys)}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
