/* Which archive the window is open on, and the way to another — the accounts
 * row at the top of Mail's sidebar, for the same reason: everything under it
 * belongs to the one it names.
 *
 * It is not the people shelf and does not replace it. The shelf says whose
 * notes, inside this archive; this says which archive. So it is small — a
 * stack of faces, a name, a chevron — and the shelf stays the large thing.
 *
 * The menu is drawn in the page and never handed to the window manager, the
 * one decision the row menu also takes: an `NSMenu` has no right button, and
 * each archive in it has a menu of its own — open it, its settings, delete
 * it. A press held still opens the archive's sheet, the way a folder's row
 * and a note's row do; it grows out of the faces. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Info, Plus, Settings, Trash2 } from "@/components/icons";
import type { SheetOrigin } from "@/components/Sheet";
import { Avatar } from "@/components/WorkspaceMenus";
import { MenuButton, MenuItems } from "@/components/MenuPrimitives";
import { ContextMenu } from "@/components/ContextMenu";
import { useDismiss } from "@/components/useDismiss";
import { acquireAvatarUrl } from "@/lib/avatarCache";
import type { MenuItem } from "@/lib/menuShape";
import type { MenuPoint } from "@/lib/contextMenu";
import type { Space, SpaceMember } from "@/lib/spaces";

const HOLD_MS = 450;
const SHOWN = 3;

/** The pictures of people who may not be in the archive on screen, leased
 *  from the same cache every other face is. */
function useFaces(members: SpaceMember[]): Record<string, string | null> {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const key = members.map((member) => `${member.userId}:${member.avatarObject}`).join();
  useEffect(() => {
    let live = true;
    const leases = members
      .filter((member) => member.avatarObject)
      .map((member) => {
        const lease = acquireAvatarUrl(member.userId, member.avatarObject!);
        void lease.url.then((url) => live && setUrls((now) => ({ ...now, [member.userId]: url })));
        return lease;
      });
    return () => {
      live = false;
      leases.forEach((lease) => lease.release());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** Up to three faces, overlapping, and how many more. */
export function FaceStack({ members, large = false }: { members: SpaceMember[]; large?: boolean }) {
  const urls = useFaces(members);
  const extra = members.length - SHOWN;
  return (
    <span className={`face-stack ${large ? "is-large" : ""}`}>
      {members.slice(0, SHOWN).map((member, index) => (
        <span key={member.userId} style={{ "--i": index } as CSSProperties}>
          <Avatar
            url={urls[member.userId] ?? null}
            name={member.nickname}
            email=""
            compact={!large}
          />
        </span>
      ))}
      {extra > 0 && <span className="face-stack-more">+{extra}</span>}
    </span>
  );
}

function spaceOrigin(element: Element): SheetOrigin {
  const { x, y, width, height } = (
    element.querySelector(".face-stack") ?? element
  ).getBoundingClientRect();
  return { x, y, width, height };
}

export function SpaceSwitch({
  spaces,
  currentId,
  defaultId,
  onSwitch,
  onInfo,
  onSettings,
  onCreate,
  onDelete,
}: {
  spaces: Space[];
  currentId: string;
  /** The archive an account starts with, which is never deleted. */
  defaultId: string | undefined;
  onSwitch: (archiveId: string) => void;
  onInfo: (origin: SheetOrigin) => void;
  onSettings: () => void;
  onCreate: (origin: SheetOrigin) => void;
  onDelete: (archiveId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<{ point: MenuPoint; items: MenuItem[] } | null>(null);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const button = useRef<HTMLButtonElement>(null);
  const hold = useRef<{ timer: number; fired: boolean } | null>(null);
  useEffect(() => () => window.clearTimeout(hold.current?.timer), []);

  const current = spaces.find((space) => space.archiveId === currentId);
  if (!current) return null;
  const origin = () => (button.current ? spaceOrigin(button.current) : spaceOrigin(document.body));

  /** What can be done to one archive: the right button on it, here or in
   *  the list. */
  function spaceItems(space: Space): MenuItem[] {
    const here = space.archiveId === currentId;
    const items: MenuItem[] = here
      ? [
          {
            kind: "item",
            id: "space-info",
            label: "Archive info",
            icon: <Info size={16} />,
            run: () => onInfo(origin()),
          },
          {
            kind: "item",
            id: "space-settings",
            label: "Settings…",
            icon: <Settings size={16} />,
            run: onSettings,
          },
        ]
      : [{ kind: "item", id: "space-open", label: "Open", run: () => onSwitch(space.archiveId) }];
    if (space.archiveId !== defaultId)
      items.push(
        { kind: "separator" },
        {
          kind: "item",
          id: "space-delete",
          label: "Delete archive",
          danger: true,
          icon: <Trash2 size={16} />,
          submenu: [
            {
              kind: "item",
              id: "space-delete-yes",
              label: `Delete “${space.name}” and every note in it`,
              danger: true,
              run: () => onDelete(space.archiveId),
            },
          ],
        },
      );
    return items;
  }

  function holdEnd() {
    if (hold.current && !hold.current.fired) {
      window.clearTimeout(hold.current.timer);
      hold.current = null;
    }
  }

  return (
    <div ref={ref} className="space-switch-wrap">
      <button
        ref={button}
        type="button"
        className="space-switch press"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          if (hold.current?.fired) return void (hold.current = null);
          setOpen((now) => !now);
        }}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse" || event.button !== 0) return;
          window.clearTimeout(hold.current?.timer);
          const press = { fired: false, timer: 0 };
          press.timer = window.setTimeout(() => {
            press.fired = true;
            setOpen(false);
            onInfo(origin());
          }, HOLD_MS);
          hold.current = press;
        }}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        onPointerCancel={holdEnd}
        onContextMenu={(event) => {
          event.preventDefault();
          holdEnd();
          setOpen(false);
          setMenu({ point: { x: event.clientX, y: event.clientY }, items: spaceItems(current) });
        }}
      >
        <FaceStack members={current.members} />
        <span className="space-switch-name">{current.name}</span>
        <ChevronDown size={14} className="space-switch-chevron" />
      </button>
      {open && (
        <div role="menu" className="popover menu-popover space-menu">
          {spaces.map((space) => (
            <div
              key={space.archiveId}
              className="space-menu-row"
              onContextMenu={(event) => {
                event.preventDefault();
                close();
                setMenu({
                  point: { x: event.clientX, y: event.clientY },
                  items: spaceItems(space),
                });
              }}
            >
              <MenuButton
                active={space.archiveId === currentId}
                onClick={() => {
                  close();
                  if (space.archiveId !== currentId) onSwitch(space.archiveId);
                }}
              >
                <FaceStack members={space.members} />
                <span className="truncate">{space.name}</span>
              </MenuButton>
            </div>
          ))}
          <div className="menu-separator" />
          <MenuItems
            close={close}
            items={[
              ...spaceItems(current).filter(
                (item) => item.kind === "item" && item.id !== "space-delete",
              ),
              {
                kind: "item",
                id: "space-new",
                label: "New archive…",
                icon: <Plus size={16} />,
                run: () => onCreate(origin()),
              },
            ]}
          />
        </div>
      )}
      {menu && (
        <ContextMenu point={menu.point} onClose={() => setMenu(null)}>
          <MenuItems items={menu.items} close={() => setMenu(null)} />
        </ContextMenu>
      )}
    </div>
  );
}
