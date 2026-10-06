/* The few controls a document carries beside its writing bar: how the page is
 * set up, what can be done with the chapter, and the document's own Trash.
 *
 * Page setup is the document's — every member writes on the same sheet — so
 * it is written to the archive, never to the account. */
import { useState, type ReactNode } from "react";
import { MoreHorizontal, Ruler } from "@/components/icons";
import { MenuItems } from "@/components/MenuPrimitives";
import { useDismiss } from "@/components/useDismiss";
import type { MenuItem } from "@/lib/menuShape";
import {
  LINE_SPACINGS,
  PAGE_MARGINS,
  PAGE_SIZES,
  WRITING_FONTS,
  type PageSetup,
} from "@/lib/spaceShape";

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <label className="page-setup-row">
      <span>{name}</span>
      {children}
    </label>
  );
}

/** The page's own fields: the popover beside the writing bar and the
 *  Document section of Settings are the same form, written once. */
export function PageSetupFields({
  page,
  disabled,
  onChange,
}: {
  page: PageSetup;
  disabled?: boolean;
  onChange: (page: PageSetup) => void;
}) {
  const set = <K extends keyof PageSetup>(key: K, value: PageSetup[K]) =>
    onChange({ ...page, [key]: value });
  return (
    <>
      <p className="menu-label">Page</p>
      <Field name="Paper">
        <select
          disabled={disabled}
          value={page.size}
          onChange={(event) => set("size", event.target.value as PageSetup["size"])}
        >
          {Object.entries(PAGE_SIZES).map(([id, size]) => (
            <option key={id} value={id}>
              {size.name} · {size.width} × {size.height} mm
            </option>
          ))}
        </select>
      </Field>
      <Field name="Orientation">
        <select
          disabled={disabled}
          value={page.orientation}
          onChange={(event) => set("orientation", event.target.value as PageSetup["orientation"])}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </Field>
      <Field name="Margins">
        <select
          disabled={disabled}
          value={page.margins}
          onChange={(event) => set("margins", event.target.value as PageSetup["margins"])}
        >
          {Object.entries(PAGE_MARGINS).map(([id, margin]) => (
            <option key={id} value={id}>
              {margin.name} · {(margin.mm / 10).toFixed(2)} cm
            </option>
          ))}
        </select>
      </Field>

      <div className="menu-separator" />
      <p className="menu-label">Body text</p>
      <Field name="Font">
        <select
          disabled={disabled}
          value={page.font}
          onChange={(event) => set("font", event.target.value as PageSetup["font"])}
        >
          {WRITING_FONTS.map((font) => (
            <option key={font.id} value={font.id} style={{ fontFamily: font.stack }}>
              {font.name}
            </option>
          ))}
        </select>
      </Field>
      <Field name="Size">
        <select
          disabled={disabled}
          value={page.fontSize}
          onChange={(event) => set("fontSize", Number(event.target.value))}
        >
          {[10, 11, 12, 13, 14, 16].map((size) => (
            <option key={size} value={size}>
              {size} pt
            </option>
          ))}
        </select>
      </Field>
      <Field name="Line spacing">
        <select
          disabled={disabled}
          value={page.lineHeight}
          onChange={(event) =>
            set("lineHeight", Number(event.target.value) as PageSetup["lineHeight"])
          }
        >
          {LINE_SPACINGS.map((spacing) => (
            <option key={spacing} value={spacing}>
              {spacing}
            </option>
          ))}
        </select>
      </Field>
      <label className="page-setup-row">
        <span>Indent first lines</span>
        <input
          type="checkbox"
          role="switch"
          disabled={disabled}
          checked={page.firstLineIndent}
          onChange={(event) => set("firstLineIndent", event.target.checked)}
        />
      </label>
    </>
  );
}

export function PageSetupButton({
  page,
  disabled,
  onChange,
}: {
  page: PageSetup;
  disabled?: boolean;
  onChange: (page: PageSetup) => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Page setup"
        title="Page setup"
        aria-expanded={open}
        className={`ribbon-tool press ${open ? "is-active" : ""}`}
        onClick={() => setOpen((now) => !now)}
      >
        <Ruler size={16} />
      </button>
      {open && (
        <div role="dialog" aria-label="Page setup" className="popover page-setup">
          <PageSetupFields page={page} disabled={disabled} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

/** A ⋯ with a list under it, for the chapter and for the Trash. */
export function MenuButton({
  label,
  icon = <MoreHorizontal size={16} />,
  items,
  className = "ribbon-tool press",
  children,
}: {
  label: string;
  icon?: ReactNode;
  items: MenuItem[];
  className?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useDismiss(open, close);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        className={`${className} ${open ? "is-active" : ""}`}
        onClick={() => setOpen((now) => !now)}
      >
        {icon}
        {children}
      </button>
      {open && (
        <div role="menu" className="popover menu-popover writing-menu">
          <MenuItems items={items} close={close} />
        </div>
      )}
    </div>
  );
}
