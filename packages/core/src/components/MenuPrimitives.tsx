import { useContext, useState, type ReactNode } from "react";
import { MenuCloseContext } from "@/components/usePresence";
import { Check, ChevronRight } from "@/components/icons";
import { findItem, type MenuItem } from "@/lib/menuShape";

export function MenuButton({
  children,
  active = false,
  danger = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`menu-row ${danger ? "text-danger" : active ? "text-accent" : "text-ink-2"}`}
    >
      {children}
      {active && <Check size={16} className="ml-auto" />}
    </button>
  );
}

/** A described menu (`@/lib/menu`) drawn in the page: one level in, and a way
 *  back out of it. */
export function MenuItems({ items, close }: { items: MenuItem[]; close: () => void }) {
  const contextClose = useContext(MenuCloseContext);
  const [inside, setInside] = useState<string | null>(null);
  const open = inside ? findItem(items, inside) : undefined;
  const section = open?.kind === "item" && open.submenu ? open.submenu : items;
  /* The acts reached for most stand first as a row of buttons; the list
     under them loses them, and any rule they leave at its edges. */
  const quick = open ? [] : section.filter((item) => item.kind === "item" && item.quick);
  const rest = section
    .filter((item) => !(item.kind === "item" && item.quick && !open))
    .filter(
      (item, index, all) =>
        item.kind !== "separator" ||
        (index > 0 && index < all.length - 1 && all[index - 1].kind !== "separator"),
    );

  return (
    <div className="menu-section" key={inside ?? "root"}>
      {open && (
        <MenuButton onClick={() => setInside(null)}>
          <ChevronRight size={16} className="rotate-180" />
          Back
        </MenuButton>
      )}
      {open?.kind === "item" && open.submenu?.length === 0 && (
        <p className="px-3 py-4 text-sm text-ink-4">{open.whenEmpty ?? "Nothing here"}</p>
      )}
      {quick.length > 0 && (
        <div className="menu-quick" role="group">
          {quick.map(
            (item) =>
              item.kind === "item" && (
                <button
                  key={item.id}
                  type="button"
                  role="menuitem"
                  aria-label={item.label}
                  title={item.label}
                  className={`menu-quick-button press ${item.checked ? "is-on" : ""} ${
                    item.danger ? "text-danger" : ""
                  }`}
                  onClick={() => {
                    (contextClose ?? close)();
                    item.run?.();
                  }}
                >
                  {item.icon}
                  <span>{item.quick}</span>
                </button>
              ),
          )}
        </div>
      )}
      {rest.map((item, index) =>
        item.kind === "separator" ? (
          <div key={`sep-${index}`} className="menu-separator" />
        ) : item.kind === "label" ? (
          <p key={`label-${index}`} className="menu-label">
            {item.label}
          </p>
        ) : (
          <MenuButton
            key={item.id}
            active={item.checked}
            danger={item.danger}
            onClick={() => {
              if (item.submenu) return setInside(item.id);
              (contextClose ?? close)();
              item.run?.();
            }}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
            {item.hint && <kbd className="menu-key">{item.hint}</kbd>}
            {item.submenu && <ChevronRight size={16} className="ml-auto" />}
          </MenuButton>
        ),
      )}
    </div>
  );
}
