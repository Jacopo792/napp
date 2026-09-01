import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Bold,
  Code2,
  Columns2,
  Columns3,
  Columns4,
  Eraser,
  FileText,
  FileUp,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Languages,
  Minus,
  Palette,
  Paperclip,
  Pilcrow,
  Quote,
  Rows3,
  SpellCheck,
  Strikethrough,
  Table2,
  Trash2,
} from "lucide-react";
import { TEXT_COLORS, type TextColor } from "@/features/editor/lib/content";
import type { FormatAction } from "./RichTextEditor";

/* ── The writing toolbar ─────────────────────────────────────────────────────
   Five tabs, and each one owns exactly the menu its icon promises: letters open
   text styling, the palette opens colour, the list icon opens lists, the grid
   icon opens tables, the clip opens attachments.

   Every menu closes on the action it performs and none of them steals the
   selection on the way — `mousedown` is cancelled everywhere, so the words that
   were highlighted when the menu opened are still highlighted when the command
   runs. That is the difference between a menu that works and one that quietly
   formats the wrong thing.

   The same component serves the phone: parity is not a port, it is this file
   being rendered twice. ──────────────────────────────────────────────────── */

type Tool = "text" | "color" | "lists" | "table" | "translate" | "attach";

interface Props {
  mobile?: boolean;
  onFormat: (action: FormatAction) => void;
  onLink: () => void;
  onAttachPdf: () => void;
  onImportMarkdown: () => void;
  onImportPdfText: () => void;
  onChoosePhoto: () => void;
  onTranslate: (language: "it" | "fr" | "en") => void;
  /** Off hides the proofreading row outright; the menu is then translation only. */
  proofreaderEnabled: boolean;
  onProofread: () => void;
  /** The insert-link form, anchored under the text tab that opened it. */
  linkForm?: ReactNode;
  linkOpen?: boolean;
  onCloseLink?: () => void;
}

const COLOR_LABEL: Record<TextColor, string> = {
  yellow: "Amber",
  purple: "Purple",
  pink: "Pink",
  orange: "Orange",
  mint: "Mint",
  blue: "Blue",
};

function Row({
  icon,
  label,
  shortcut,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="menu-row text-ink-2"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      <span className="text-ink-3">{icon}</span>
      <span>{label}</span>
      {shortcut && <span className="readout ml-auto text-ink-4">{shortcut}</span>}
    </button>
  );
}

/* ── The dock ────────────────────────────────────────────────────────────────
   Six equal icons in a pill is a dock, so it behaves like one: the icon under
   the pointer grows, its neighbours grow less, and everything to either side
   steps out of the way rather than being overlapped.

   The stepping-aside is the half of it people notice only when it is missing —
   an icon that grows without displacing its neighbours slides under them, and
   the row reads as a rendering bug. It is not computed as a rule about
   neighbours, though: the row is simply laid out twice, once at rest and once
   at the grown widths, and each button is told the difference. Anything else
   turns into a special case about the button the pointer is straddling, which
   belongs to both sides at once.

   The expansion is centred on the cluster rather than on the pointer, which is
   what the real dock does: hovering the leftmost icon nudges the whole row
   right instead of pushing five icons off the end.

   Positions are measured once when the pointer arrives and not per frame: by
   the second frame the buttons are already scaled, so their own boxes have
   stopped saying where they sit. */

/** How far from the pointer the bulge reaches, in px — about three buttons. */
const DOCK_REACH = 96;
/** How much the icon directly under the pointer grows. */
const DOCK_LIFT = 0.42;

/** Smooth, and genuinely zero at the edge of the reach, so the outermost icon
 *  settles rather than stopping mid-move. */
function bump(t: number): number {
  if (t >= 1) return 0;
  const falling = 1 - t * t;
  return falling * falling;
}

export function EditorToolbar({
  mobile = false,
  onFormat,
  onLink,
  onAttachPdf,
  onImportMarkdown,
  onImportPdfText,
  onChoosePhoto,
  onTranslate,
  proofreaderEnabled,
  onProofread,
  linkForm,
  linkOpen = false,
  onCloseLink,
}: Props) {
  const [open, setOpen] = useState<Tool | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const dock = useRef<{ button: HTMLElement; x: number; width: number }[]>([]);

  function measureDock() {
    const cluster = root.current;
    if (!cluster) return;
    dock.current = [...cluster.querySelectorAll<HTMLElement>(".editor-tool-button")].map(
      (button) => {
        const box = button.getBoundingClientRect();
        return { button, x: box.left + box.width / 2, width: box.width };
      },
    );
  }

  function magnify(pointerX: number) {
    const items = dock.current;
    if (items.length === 0) return;
    const growth = items.map((item) => DOCK_LIFT * bump(Math.abs(pointerX - item.x) / DOCK_REACH));

    // Lay the row out at the grown widths, then again at rest, in one shared
    // coordinate space. The gap between buttons is whatever it already is.
    const gap = items.length > 1 ? items[1].x - items[0].x - items[0].width : 0;
    let grownEdge = 0;
    let restingEdge = 0;
    const offsets = items.map((item, index) => {
      const grownWidth = item.width * (1 + growth[index]);
      const offset = grownEdge + grownWidth / 2 - (restingEdge + item.width / 2);
      grownEdge += grownWidth + gap;
      restingEdge += item.width + gap;
      return offset;
    });

    // Half the total growth, taken off every button, is what centres the bulge
    // on the cluster instead of letting the row grow to the right only.
    const drift = (grownEdge - restingEdge) / 2;
    items.forEach((item, index) => {
      item.button.style.setProperty("--mag", String(1 + growth[index]));
      item.button.style.setProperty("--dock-shift", `${offsets[index] - drift}px`);
    });
  }

  function settleDock() {
    for (const item of dock.current) {
      item.button.style.removeProperty("--mag");
      item.button.style.removeProperty("--dock-shift");
    }
  }
  const id = useId();

  useEffect(() => {
    if (!open && !linkOpen) return;
    function dismiss(event: MouseEvent) {
      if (root.current?.contains(event.target as Node)) return;
      setOpen(null);
      onCloseLink?.();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(null);
      onCloseLink?.();
    }
    document.addEventListener("mousedown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, linkOpen, onCloseLink]);

  /** Every menu item does its thing and gets out of the way. */
  function run(action: FormatAction) {
    setOpen(null);
    onFormat(action);
  }

  function toggle(tool: Tool) {
    onCloseLink?.();
    // A menu hangs off its button's resting position, not its magnified one, so
    // the dock stands down for as long as one is open rather than sliding the
    // button out from under its own popover.
    settleDock();
    setOpen((current) => (current === tool ? null : tool));
  }

  function tab(tool: Tool, label: string, icon: ReactNode) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open === tool}
        aria-controls={`${id}-${tool}`}
        className={`editor-tool-button ${open === tool ? "is-active" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => toggle(tool)}
      >
        {icon}
      </button>
    );
  }

  function menu(tool: Tool, label: string, align: "left" | "right", children: ReactNode) {
    if (open !== tool) return null;
    return (
      <div
        id={`${id}-${tool}`}
        role="menu"
        aria-label={label}
        className={`popover menu-popover editor-tool-menu absolute top-full z-40 mt-2 p-1.5 ${
          align === "left" ? "left-0" : "right-0"
        }`}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      ref={root}
      className={`editor-tool-cluster glass-toolbar flex items-center p-1 ${
        mobile ? "is-mobile" : ""
      }`}
      /* A finger has no position between taps, so there is nothing for a dock
         to follow: mice and trackpads only. */
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse" || open) return;
        measureDock();
        magnify(event.clientX);
      }}
      onPointerMove={(event) => {
        if (event.pointerType !== "mouse" || open || dock.current.length === 0) return;
        magnify(event.clientX);
      }}
      onPointerLeave={settleDock}
    >
      {/* ── Text ── */}
      <div className="relative">
        {tab("text", "Text formatting", <span className="font-display text-[17px]">Aa</span>)}
        {menu(
          "text",
          "Text formatting",
          "left",
          <>
            <div className="menu-segments" role="group" aria-label="Character style">
              <button
                type="button"
                aria-label="Bold"
                title="Bold · ⌘B"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run("bold")}
              >
                <Bold size={16} />
              </button>
              <button
                type="button"
                aria-label="Italic"
                title="Italic · ⌘I"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run("italic")}
              >
                <Italic size={16} />
              </button>
              <button
                type="button"
                aria-label="Strikethrough"
                title="Strikethrough"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run("strike")}
              >
                <Strikethrough size={16} />
              </button>
              <button
                type="button"
                aria-label="Inline code"
                title="Inline code"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => run("code")}
              >
                <Code2 size={16} />
              </button>
            </div>

            <div className="menu-separator" />
            <p className="menu-label">Paragraph style</p>
            <Row icon={<Pilcrow size={16} />} label="Body" onClick={() => run("body")} />
            <Row icon={<Heading1 size={16} />} label="Title" onClick={() => run("heading-1")} />
            <Row icon={<Heading2 size={16} />} label="Heading" onClick={() => run("heading-2")} />
            <Row
              icon={<Heading3 size={16} />}
              label="Subheading"
              onClick={() => run("heading-3")}
            />
            <Row icon={<Quote size={16} />} label="Quote" onClick={() => run("quote")} />

            <div className="menu-separator" />
            <Row
              icon={<Link size={16} />}
              label="Link"
              onClick={() => {
                setOpen(null);
                onLink();
              }}
            />
            <Row icon={<Minus size={16} />} label="Divider" onClick={() => run("divider")} />
            <p className="menu-note">
              Every style is a switch: choosing the one a paragraph already has takes it off.
            </p>
          </>,
        )}
        {linkOpen && linkForm}
      </div>

      {/* ── Colour ── */}
      <div className="relative">
        {tab("color", "Text colour", <Palette size={18} />)}
        {menu(
          "color",
          "Text colour",
          "left",
          <>
            <p className="menu-label">Colour the selection</p>
            <div className="menu-swatches" role="group" aria-label="Text colour">
              {TEXT_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`${COLOR_LABEL[color]} text`}
                  title={COLOR_LABEL[color]}
                  className={`menu-swatch is-${color}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => run(`color-${color}`)}
                >
                  A
                </button>
              ))}
            </div>
            <button
              type="button"
              role="menuitem"
              className="menu-row text-ink-2"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => run("color-clear")}
            >
              <span className="text-ink-3">
                <Eraser size={16} />
              </span>
              <span>Back to normal</span>
            </button>
            <p className="menu-note">Select the words first — colour applies to a selection.</p>
          </>,
        )}
      </div>

      {/* ── Lists ── */}
      <div className="relative">
        {tab("lists", "Lists", <ListChecks size={18} />)}
        {menu(
          "lists",
          "Lists",
          "left",
          <>
            <Row
              icon={<ListChecks size={16} />}
              label="Checklist"
              onClick={() => run("checklist")}
            />
            <Row
              icon={<List size={16} />}
              label="Bulleted list"
              onClick={() => run("bullet-list")}
            />
            <Row
              icon={<ListOrdered size={16} />}
              label="Numbered list"
              onClick={() => run("ordered-list")}
            />
            <p className="menu-note">
              The lines you selected become the list — or the line you are on, if you selected
              nothing. Return starts the next item; Return on an empty item ends the list.
            </p>
          </>,
        )}
      </div>

      {/* ── Tables ── */}
      <div className="relative">
        {tab("table", "Tables", <Table2 size={18} />)}
        {menu(
          "table",
          "Tables",
          "left",
          <>
            <p className="menu-label">Insert table</p>
            <Row icon={<Columns2 size={16} />} label="2 columns" onClick={() => run("table-2")} />
            <Row icon={<Columns3 size={16} />} label="3 columns" onClick={() => run("table-3")} />
            <Row icon={<Columns4 size={16} />} label="4 columns" onClick={() => run("table-4")} />
            <div className="menu-separator" />
            <p className="menu-label">Selected table</p>
            <Row
              icon={<Trash2 size={16} />}
              label="Delete column"
              onClick={() => run("table-delete-column")}
            />
            <Row
              icon={<Trash2 size={16} />}
              label="Delete row"
              onClick={() => run("table-delete-row")}
            />
            <Row
              icon={<Trash2 size={16} />}
              label="Delete table"
              onClick={() => run("table-delete")}
            />
            <p className="menu-note">Click inside a cell before changing its row or column.</p>
          </>,
        )}
      </div>

      {/* ── Language, on this device ── */}
      <div className="relative">
        {tab("translate", "Language tools", <Languages size={18} />)}
        {menu(
          "translate",
          "Language tools",
          "right",
          <>
            {proofreaderEnabled && (
              <>
                <p className="menu-label">Selected text</p>
                <Row
                  icon={<SpellCheck size={16} />}
                  label="Fix spelling and grammar"
                  onClick={() => (setOpen(null), onProofread())}
                />
                <div className="menu-separator" />
              </>
            )}
            <p className="menu-label">Translate selected text to</p>
            <Row
              icon={<span>IT</span>}
              label="Italiano"
              onClick={() => (setOpen(null), onTranslate("it"))}
            />
            <Row
              icon={<span>FR</span>}
              label="Français"
              onClick={() => (setOpen(null), onTranslate("fr"))}
            />
            <Row
              icon={<span>EN</span>}
              label="English"
              onClick={() => (setOpen(null), onTranslate("en"))}
            />
            <p className="menu-note">These run on this device in supported desktop browsers.</p>
          </>,
        )}
      </div>

      {/* ── Attachments ── */}
      <div className="relative">
        {tab("attach", "Attachments", <Paperclip size={18} />)}
        {menu(
          "attach",
          "Attachments",
          "right",
          <>
            {/* Importing is the one people reach for, so it is the first thing
                under the clip rather than the afterthought below a rule. The
                paragraph that used to explain the difference is gone: the two
                labels already say it, and a menu that has to footnote itself is
                a menu with the wrong labels. */}
            <Row
              icon={<FileUp size={16} />}
              label="Import as Markdown"
              onClick={() => {
                setOpen(null);
                onImportMarkdown();
              }}
            />
            <div className="menu-separator" />
            <Row
              icon={<FileUp size={16} />}
              label="Import PDF as text"
              onClick={() => {
                setOpen(null);
                onImportPdfText();
              }}
            />
            <div className="menu-separator" />
            <Row
              icon={<FileText size={16} />}
              label="Attach PDF"
              onClick={() => {
                setOpen(null);
                onAttachPdf();
              }}
            />
            <Row
              icon={<ImagePlus size={16} />}
              label="Attach photo"
              onClick={() => {
                setOpen(null);
                onChoosePhoto();
              }}
            />
          </>,
        )}
      </div>
    </div>
  );
}
