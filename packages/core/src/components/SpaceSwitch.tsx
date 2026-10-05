/* Which archive the window is open on, and the way to another — the accounts
 * row at the top of Mail's sidebar, for the same reason: everything under it
 * belongs to the one it names.
 *
 * It is not the people shelf and does not replace it. The shelf says whose
 * notes, inside this archive; this says which archive. So it is small — a
 * stack of faces, a name, a chevron — and the shelf stays the large thing.
 *
 * The menu is a list (`menuShape.ts`), so a Mac draws it as an `NSMenu` and a
 * tab as a popover. A press held still opens the archive's sheet, the way a
 * folder's row and a note's row do; it grows out of the faces. */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, Info, Plus } from "@/components/icons";
import type { SheetOrigin } from "@/components/Sheet";
import { Avatar } from "@/components/WorkspaceMenus";
import { MenuItems } from "@/components/MenuPrimitives";
import { useDismiss } from "@/components/useDismiss";
import { useSystemMenu } from "@/components/useSystemMenu";
import { acquireAvatarUrl } from "@/lib/avatarCache";
import type { MenuItem } from "@/lib/menuShape";
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

function SpaceMenu({ items, close }: { items: MenuItem[]; close: () => void }) {
  const system = useSystemMenu(items, close);
  if (system) return null;
  return (
    <div role="menu" className="popover menu-popover space-menu">
      <MenuItems items={items} close={close} />
    </div>
  );
}

export function SpaceSwitch({
  spaces,
  currentId,
  onSwitch,
  onInfo,
  onCreate,
}: {
  spaces: Space[];
  currentId: string;
  onSwitch: (archiveId: string) => void;
  onInfo: (origin: SheetOrigin) => void;
  onCreate: (origin: SheetOrigin) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  const button = useRef<HTMLButtonElement>(null);
  const hold = useRef<{ timer: number; fired: boolean } | null>(null);
  useEffect(() => () => window.clearTimeout(hold.current?.timer), []);

  const current = spaces.find((space) => space.archiveId === currentId);
  if (!current) return null;
  const origin = () => (button.current ? spaceOrigin(button.current) : spaceOrigin(document.body));

  const items: MenuItem[] = [
    ...spaces.map(
      (space): MenuItem => ({
        kind: "item",
        id: `space:${space.archiveId}`,
        label: space.name,
        checked: space.archiveId === currentId,
        icon: <FaceStack members={space.members} />,
        run: () => {
          if (space.archiveId !== currentId) onSwitch(space.archiveId);
        },
      }),
    ),
    { kind: "separator" },
    {
      kind: "item",
      id: "space-info",
      label: "Archive info",
      icon: <Info size={16} />,
      run: () => onInfo(origin()),
    },
    {
      kind: "item",
      id: "space-new",
      label: "New archive…",
      icon: <Plus size={16} />,
      run: () => onCreate(origin()),
    },
  ];

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
          setOpen(true);
        }}
      >
        <FaceStack members={current.members} />
        <span className="space-switch-name">{current.name}</span>
        <ChevronDown size={14} className="space-switch-chevron" />
      </button>
      {open && <SpaceMenu items={items} close={close} />}
    </div>
  );
}
