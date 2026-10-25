import { useMemo, useState, type ReactNode } from "react";
import { Archive, ArrowRight, Info, MoreHorizontal, Pencil, FolderPlus, Trash2 } from "./icons";
import { PointMenu } from "./ContextMenu";
import { FOLDER_ACT, type FolderAct } from "./Sidebar";
import type { SheetOrigin } from "./Sheet";
import type { MenuItem } from "@/lib/menuShape";
import type { MenuPoint } from "@/lib/contextMenu";
import type { NoteEntry } from "@/lib/entries";
import type { Folder, Meta } from "@/lib/types";
import { ALL, ARCHIVE, TRASH, entriesInScope } from "@/lib/scopes";
import { derivedOf, indexOf } from "@/lib/derived";
import { formatStamp } from "@/lib/format";

/* ── Home ────────────────────────────────────────────────────────────────────
   The phone's first tab, on the computer: the notebook's front page. What was
   written last, what is pinned, every folder with its newest three, and the
   two places a note goes away to. Read from the archive already in memory —
   nothing here asks the database anything. It takes the place of the list and
   the note; opening anything from it leaves it for them. */

const newest = (entries: NoteEntry[]) =>
  [...entries].sort((a, b) => b.note.updatedAt.localeCompare(a.note.updatedAt));

/** Folders in the order the sidebar draws them: each followed by its children. */
function nested(folders: Folder[]): Folder[] {
  const known = new Set(folders.map((folder) => folder.id));
  const out: Folder[] = [];
  const walk = (parent: string | null) => {
    for (const folder of folders) {
      const under = folder.parentId && known.has(folder.parentId) ? folder.parentId : null;
      if (under !== parent) continue;
      out.push(folder);
      walk(folder.id);
    }
  };
  walk(null);
  return out;
}

const tally = (count: number) => (count === 1 ? "1 note" : `${count} notes`);

function originOf(element: Element): SheetOrigin {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height };
}

export function HomePage({
  leading,
  entries,
  meta,
  own,
  canWrite,
  faces,
  onOpenNote,
  onOpenScope,
  onNew,
  onFolderInfo,
  onDeleteFolder,
}: {
  /** What stands at the start of the strip: the sidebar's toggle. */
  leading?: ReactNode;
  /** The chosen member's whole catalogue. */
  entries: NoteEntry[];
  meta: Meta;
  /** Whether this is the reader's own notebook. */
  own: boolean;
  canWrite: boolean;
  /** The faces of whoever is in a note now, or nothing. */
  faces: (noteId: string) => ReactNode;
  onOpenNote: (id: string) => void;
  onOpenScope: (scope: string) => void;
  onNew: () => void;
  onFolderInfo: (id: string, origin: SheetOrigin) => void;
  onDeleteFolder: (id: string) => void;
}) {
  const [menu, setMenu] = useState<(MenuPoint & { items: MenuItem[] }) | null>(null);
  const index = indexOf(meta);
  const page = useMemo(() => {
    const inScope = (scope: string) => entriesInScope(entries, meta, scope);
    const all = newest(inScope(ALL));
    return {
      all,
      pinned: all.filter((entry) => index.byNote.get(entry.note.id)?.pinned),
      folders: nested(meta.folders).map((folder) => ({
        folder,
        inside: newest(inScope(folder.id)),
      })),
      archived: inScope(ARCHIVE).length,
      trashed: inScope(TRASH).length,
    };
  }, [entries, meta, index]);
  const folderName = new Map(meta.folders.map((folder) => [folder.id, folder.name]));
  const latest = page.all[0];

  const strip = <header className="home-strip">{leading}</header>;

  /* Nothing written yet: the first line, waiting. Your page only — a
     partner's empty page is simply empty. */
  if (!entries.length)
    return (
      <section className="home-page" aria-label="Home">
        {strip}
        <div className="home-scroll">
          <div className="home-measure">
            {own && canWrite && (
              <button type="button" className="home-card home-continue press" onClick={onNew}>
                <span className="home-continue-empty">
                  Write something
                  <i className="home-caret" aria-hidden="true" />
                </span>
                <span className="home-foot">
                  <span />
                  <span className="home-arrow is-accent" aria-hidden="true">
                    <ArrowRight size={17} />
                  </span>
                </span>
              </button>
            )}
          </div>
        </div>
      </section>
    );

  function folderMenu(event: React.MouseEvent<HTMLElement>, folder: Folder) {
    const button = event.currentTarget;
    const { left, bottom } = button.getBoundingClientRect();
    const act = (kind: FolderAct["act"]) =>
      window.dispatchEvent(
        new CustomEvent<FolderAct>(FOLDER_ACT, { detail: { id: folder.id, act: kind } }),
      );
    const items: MenuItem[] = [
      {
        kind: "item",
        id: "folder:info",
        label: "Folder info",
        icon: <Info size={16} />,
        run: () => onFolderInfo(folder.id, originOf(button)),
      },
      ...(canWrite
        ? ([
            { kind: "separator" },
            {
              kind: "item",
              id: "folder:rename",
              label: "Rename folder",
              icon: <Pencil size={16} />,
              run: () => act("rename"),
            },
            {
              kind: "item",
              id: "folder:subfolder",
              label: "New folder inside",
              icon: <FolderPlus size={16} />,
              run: () => act("subfolder"),
            },
            { kind: "separator" },
            {
              kind: "item",
              id: "folder:delete",
              label: "Delete folder",
              icon: <Trash2 size={16} />,
              danger: true,
              submenu: [
                {
                  kind: "item",
                  id: "folder:delete:confirm",
                  label: `Delete “${folder.name}”`,
                  danger: true,
                  run: () => onDeleteFolder(folder.id),
                },
              ],
            },
          ] satisfies MenuItem[])
        : []),
    ];
    setMenu({ x: left, y: bottom + 4, items });
  }

  return (
    <section className="home-page" aria-label="Home">
      {strip}
      <div className="home-scroll">
        <div className="home-measure">
          {latest && (
            <button
              type="button"
              className="home-card home-continue press"
              onClick={() => onOpenNote(latest.note.id)}
            >
              <span className="home-label">Continue Writing</span>
              <span className="home-continue-title">{latest.note.title || "Untitled"}</span>
              {derivedOf(latest.note).preview && (
                <span className="home-continue-preview">{derivedOf(latest.note).preview}</span>
              )}
              <span className="home-foot">
                <span className="home-where">
                  {[
                    folderName.get(index.byNote.get(latest.note.id)?.folderId ?? ""),
                    formatStamp(latest.note.updatedAt),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  {faces(latest.note.id)}
                </span>
                <span className="home-arrow" aria-hidden="true">
                  <ArrowRight size={17} />
                </span>
              </span>
            </button>
          )}

          {page.pinned.length > 0 && (
            <section className="home-section" aria-label="Pinned">
              <h2>Pinned</h2>
              <div className="home-pinned">
                {page.pinned.map((entry) => (
                  <button
                    key={entry.note.id}
                    type="button"
                    className="home-card home-pin press"
                    onClick={() => onOpenNote(entry.note.id)}
                  >
                    <span className="home-pin-title">{entry.note.title || "Untitled"}</span>
                    <span className="home-pin-preview">{derivedOf(entry.note).preview}</span>
                    <span className="home-pin-date">
                      {formatStamp(entry.note.updatedAt)}
                      {faces(entry.note.id)}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {page.folders.length > 0 && (
            <section className="home-section" aria-label="Folders">
              <h2>Folders</h2>
              <div className="home-folders">
                {page.folders.map(({ folder, inside }) => (
                  <div key={folder.id} className="home-card home-folder">
                    <div className="home-folder-head">
                      <h3>{folder.name}</h3>
                      <button
                        type="button"
                        aria-label={`${folder.name} actions`}
                        aria-haspopup="menu"
                        className="home-more press"
                        onClick={(event) => folderMenu(event, folder)}
                      >
                        <MoreHorizontal size={20} />
                      </button>
                    </div>
                    {inside.length > 0 && (
                      <div className="home-well">
                        {inside.slice(0, 3).map((entry) => (
                          <button
                            key={entry.note.id}
                            type="button"
                            className="home-well-row press"
                            onClick={() => onOpenNote(entry.note.id)}
                          >
                            <span className="home-well-title">
                              {entry.note.title || "Untitled"}
                            </span>
                            {faces(entry.note.id)}
                            <span className="home-well-date">
                              {formatStamp(entry.note.updatedAt)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="home-foot">
                      <span className="home-where">{tally(inside.length)}</span>
                      <button
                        type="button"
                        aria-label={`Open ${folder.name}`}
                        className="home-arrow press"
                        onClick={() => onOpenScope(folder.id)}
                      >
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="home-card home-places">
            <button type="button" className="home-place press" onClick={() => onOpenScope(ARCHIVE)}>
              <span className="home-place-tile" data-tone="archive">
                <Archive size={18} />
              </span>
              Archive
              <span className="home-place-count">{page.archived}</span>
            </button>
            <button type="button" className="home-place press" onClick={() => onOpenScope(TRASH)}>
              <span className="home-place-tile" data-tone="trash">
                <Trash2 size={18} />
              </span>
              Recently Deleted
              <span className="home-place-count">{page.trashed}</span>
            </button>
          </div>
        </div>
      </div>
      {menu && <PointMenu point={menu} items={menu.items} close={() => setMenu(null)} />}
    </section>
  );
}
