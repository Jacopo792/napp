import { FolderInput, Lock, LockOpen, Pin } from "lucide-react";
import type { MenuItem } from "@/lib/menuShape";
import type { NoteLock } from "@/lib/types";

/* ── The three items both menus about a note carry ───────────────────────────
   A note is named in two places — the row it sits on in the catalogue, and the
   page it is open on — and a right-click in either offers a menu. They are not
   the same menu: a row offers Open note, a photograph and the scope's own two
   acts, and a page offers Find, Focus, the exports and Print. What they share
   is what is true of the note wherever you are looking at it, and those three
   were written out twice, with the same labels, in two files. Two copies of a
   label is one copy and one lie waiting to happen. ─────────────────────────── */

export function pinItem(pinned: boolean, run: () => void): MenuItem {
  return {
    kind: "item",
    id: "pin",
    label: pinned ? "Unpin note" : "Pin note",
    icon: <Pin size={16} />,
    checked: pinned,
    run,
  };
}

/** Nothing where there is no lock to speak of, a line where somebody else
 *  holds it — lifting it is theirs to do, here and in Postgres — and the
 *  offer where it is yours or nobody's. */
export function lockItems(lock: NoteLock | undefined | null): MenuItem[] {
  if (!lock) return [];
  if (!lock.mine && lock.holderName)
    return [{ kind: "label", label: `Locked by ${lock.holderName}` }];
  return [
    {
      kind: "item",
      id: "lock",
      label: lock.mine ? "Let them write again" : "Only I may write this",
      icon: lock.mine ? <LockOpen size={16} /> : <Lock size={16} />,
      checked: lock.mine,
      run: lock.onToggle,
    },
  ];
}

export function moveItem(
  folders: { id: string; name: string }[],
  run: (folderId: string | null) => void,
): MenuItem {
  return {
    kind: "item",
    id: "move",
    label: "Move note",
    icon: <FolderInput size={16} />,
    submenu: [
      { kind: "label", label: "Move to" },
      {
        kind: "item",
        id: "move:unfiled",
        label: "Unfiled",
        icon: <FolderInput size={16} />,
        run: () => run(null),
      },
      ...folders.map((folder) => ({
        kind: "item" as const,
        id: `move:${folder.id}`,
        label: folder.name,
        icon: <FolderInput size={16} />,
        run: () => run(folder.id),
      })),
    ],
  };
}
