/* The writing bar of a document: Word's Home tab, cut to what a long piece of
 * writing is actually set with.
 *
 * Groups in Word's order, because that order is in the hand of everybody who
 * has written a thesis: history, style, character, paragraph, insert, find.
 * Every group is one press away and none hides behind a tab — a ribbon's
 * tabs exist because Word has two thousand commands, and this has forty.
 *
 * It reads the selection (`useEditorState`), so the font menu says which font
 * the words are in, the size says their size and the alignment shows which
 * one is on. A bar that cannot say what is set is a bar you test by typing.
 *
 * `<select>` for style, font, size and spacing: a list of names is what the
 * platform already draws best, it is reachable from the keyboard, and the
 * editor keeps its selection while one is open — `chain().focus()` puts the
 * caret back where it was before the command runs. Every button cancels its
 * own `mousedown` for the same reason. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Caption,
  Chapters,
  CrossReference,
  Eraser,
  Footnote,
  Highlighter,
  ImagePlus,
  Indent,
  Italic,
  LineSpacing,
  Link,
  List,
  ListOrdered,
  Minus,
  Outdent,
  PageBreak,
  Plus,
  Redo2,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Underline,
  Undo2,
} from "@/components/icons";
import { WRITING_FONTS, type PageSetup } from "@/lib/spaceShape";
import { insertCaption, insertCrossReference, insertFootnote } from "../lib/referenceMarks";
import { CrossReferencePicker } from "./CrossReferencePicker";
import { keyName } from "@/lib/shortcuts";

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];

/* Ink for a white page. "Automatic" is no colour at all, which is the page's
   own ink — the only choice that still reads if the page is ever darkened. */
const INKS = [
  { name: "Black", value: "#1f1f1f" },
  { name: "Grey", value: "#595959" },
  { name: "Dark red", value: "#a61e1e" },
  { name: "Red", value: "#e03131" },
  { name: "Orange", value: "#d9480f" },
  { name: "Gold", value: "#9c7a00" },
  { name: "Green", value: "#2b8a3e" },
  { name: "Blue", value: "#1c64c6" },
  { name: "Navy", value: "#1f3864" },
  { name: "Purple", value: "#6741d9" },
];

const MARKERS = [
  { name: "Yellow", value: "#fff27a" },
  { name: "Green", value: "#b2f2bb" },
  { name: "Turquoise", value: "#99e9f2" },
  { name: "Pink", value: "#ffc9de" },
  { name: "Blue", value: "#bfdbfe" },
  { name: "Lilac", value: "#e5dbff" },
  { name: "Orange", value: "#ffd8a8" },
  { name: "Grey", value: "#e9ecef" },
];

type Align = "left" | "center" | "right" | "justify";

const ALIGNS = [
  ["left", "Align left", <AlignLeft key="l" size={16} />, "⇧⌘L"],
  ["center", "Centre", <AlignCenter key="c" size={16} />, "⇧⌘E"],
  ["right", "Align right", <AlignRight key="r" size={16} />, "⇧⌘R"],
  ["justify", "Justify", <AlignJustify key="j" size={16} />, "⇧⌘J"],
] as const;

function MenuRow({
  icon,
  label,
  hint,
  checked,
  onPress,
}: {
  icon: ReactNode;
  label: string;
  hint?: string;
  checked?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemradio"}
      aria-checked={checked}
      className={`menu-row text-ink-2 ${checked ? "is-checked" : ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      <span className="text-ink-3">{icon}</span>
      <span>{label}</span>
      {hint && <span className="readout ml-auto text-ink-4">{hint}</span>}
    </button>
  );
}

function blockAttribute(editor: Editor, name: string): unknown {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "paragraph" || node.type.name === "heading") return node.attrs[name];
  }
  return undefined;
}

/** The paragraph and heading attributes the selection covers, set at once:
 *  Word's alignment and spacing act on every paragraph the selection
 *  touches, never only the one the caret is in. */
function setBlock(editor: Editor, attrs: Record<string, unknown>) {
  editor
    .chain()
    .focus()
    .updateAttributes("paragraph", attrs)
    .updateAttributes("heading", attrs)
    .run();
}

function Tool({
  label,
  shortcut,
  active,
  disabled,
  onPress,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={shortcut ? `${label} · ${keyName(shortcut)}` : label}
      aria-pressed={active}
      disabled={disabled}
      className={`ribbon-tool press ${active ? "is-active" : ""}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

/** A tool with a panel under it: colour, highlight, insert. */
function Drop({
  label,
  face,
  disabled,
  children,
}: {
  label: string;
  face: ReactNode;
  disabled?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <span ref={root} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        className={`ribbon-tool press ${open ? "is-active" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((now) => !now)}
      >
        {face}
      </button>
      {open && (
        <div role="menu" aria-label={label} className="popover ribbon-panel">
          {children(() => setOpen(false))}
        </div>
      )}
    </span>
  );
}

function Swatches({
  colors,
  none,
  onPick,
}: {
  colors: { name: string; value: string }[];
  none: string;
  onPick: (value: string | null) => void;
}) {
  return (
    <>
      <div className="ribbon-swatches">
        {colors.map((color) => (
          <button
            key={color.value}
            type="button"
            aria-label={color.name}
            title={color.name}
            className="ribbon-swatch press"
            style={{ background: color.value }}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(color.value)}
          />
        ))}
        {/* Any other colour: the input is invisible inside its label, which
            is the swatch — styling the input itself means three vendor
            pseudo-elements that disagree. */}
        <label className="ribbon-swatch is-other press" title="Other colour">
          <Plus size={12} />
          <input type="color" onChange={(event) => onPick(event.target.value)} />
        </label>
      </div>
      <button
        type="button"
        role="menuitem"
        className="menu-row text-ink-2"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick(null)}
      >
        <span className="text-ink-3">
          <Eraser size={16} />
        </span>
        <span>{none}</span>
      </button>
    </>
  );
}

export function ManuscriptToolbar({
  editor,
  noteId,
  footnotes,
  page,
  onLink,
  onImage,
}: {
  editor: Editor | null;
  /** The chapter, so a cross-reference says "in chapter 2" only of others. */
  noteId: string;
  /** The document has footnotes on. */
  footnotes: boolean;
  /** Which side of a table its caption goes. */
  page: Pick<PageSetup, "tableCaption">;
  onLink: () => void;
  onImage: () => void;
}) {
  const [citing, setCiting] = useState(false);
  const citeRoot = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!citing) return;
    const away = (event: PointerEvent) => {
      if (!citeRoot.current?.contains(event.target as Node)) setCiting(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [citing]);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return null;
      const style = current.getAttributes("textStyle");
      const level = [1, 2, 3].find((n) => current.isActive("heading", { level: n }));
      return {
        editable: current.isEditable,
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        block: current.isActive("blockquote") ? "quote" : level ? `h${level}` : "body",
        font: (style.fontFamily as string | undefined) ?? "",
        size: (style.fontSize as string | undefined) ?? "",
        color: (style.color as string | undefined) ?? "",
        marker: (style.backgroundColor as string | undefined) ?? "",
        bold: current.isActive("bold"),
        italic: current.isActive("italic"),
        underline: current.isActive("underline"),
        strike: current.isActive("strike"),
        sup: current.isActive("superscript"),
        sub: current.isActive("subscript"),
        bullets: current.isActive("bulletList"),
        numbers: current.isActive("orderedList"),
        align: ((blockAttribute(current, "textAlign") as Align | null) ?? "left") as Align,
        spacing: (blockAttribute(current, "lineHeight") as number | null) ?? null,
        indent: (blockAttribute(current, "indent") as number | undefined) ?? 0,
      };
    },
  });

  const off = !editor || !state?.editable;
  const chain = () => editor!.chain().focus();
  const points = state?.size ? parseFloat(state.size) : null;

  return (
    <div className="ribbon" role="toolbar" aria-label="Formatting">
      <div className="ribbon-group is-history">
        <Tool
          label="Undo"
          shortcut="⌘Z"
          disabled={off || !state?.canUndo}
          onPress={() => chain().undo().run()}
        >
          <Undo2 size={16} />
        </Tool>
        <Tool
          label="Redo"
          shortcut="⇧⌘Z"
          disabled={off || !state?.canRedo}
          onPress={() => chain().redo().run()}
        >
          <Redo2 size={16} />
        </Tool>
      </div>

      <div className="ribbon-group">
        <select
          className="ribbon-select is-style"
          aria-label="Paragraph style"
          disabled={off}
          value={state?.block ?? "body"}
          onChange={(event) => {
            const value = event.target.value;
            const run = chain();
            if (value === "body") run.setParagraph().run();
            else if (value === "quote") run.setParagraph().toggleBlockquote().run();
            else run.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="body">Body text</option>
          <option value="h1">Title 1</option>
          <option value="h2">Title 2</option>
          <option value="h3">Title 3</option>
          <option value="quote">Block quote</option>
        </select>
      </div>

      <div className="ribbon-group">
        <select
          className="ribbon-select is-font"
          aria-label="Font"
          disabled={off}
          value={state?.font ?? ""}
          style={{ fontFamily: state?.font || undefined }}
          onChange={(event) => {
            const value = event.target.value;
            if (value) chain().setFontFamily(value).run();
            else chain().unsetFontFamily().run();
          }}
        >
          <option value="">Page font</option>
          {WRITING_FONTS.map((font) => (
            <option key={font.id} value={font.stack} style={{ fontFamily: font.stack }}>
              {font.name}
            </option>
          ))}
          {/* A face that arrived with pasted text and is not on the list
              still has to be nameable, or the menu shows a lie. */}
          {state?.font && !WRITING_FONTS.some((font) => font.stack === state.font) && (
            <option value={state.font}>{state.font.split(",")[0].replaceAll('"', "")}</option>
          )}
        </select>
        <select
          className="ribbon-select is-size"
          aria-label="Font size"
          disabled={off}
          value={points ?? ""}
          onChange={(event) => {
            const value = event.target.value;
            if (value) chain().setFontSize(`${value}pt`).run();
            else chain().unsetFontSize().run();
          }}
        >
          <option value="">Auto</option>
          {SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
          {points && !SIZES.includes(points) && <option value={points}>{points}</option>}
        </select>
      </div>

      <div className="ribbon-group">
        <Tool
          label="Bold"
          shortcut="⌘B"
          active={state?.bold}
          disabled={off}
          onPress={() => chain().toggleBold().run()}
        >
          <Bold size={16} />
        </Tool>
        <Tool
          label="Italic"
          shortcut="⌘I"
          active={state?.italic}
          disabled={off}
          onPress={() => chain().toggleItalic().run()}
        >
          <Italic size={16} />
        </Tool>
        <Tool
          label="Underline"
          shortcut="⌘U"
          active={state?.underline}
          disabled={off}
          onPress={() => chain().toggleUnderline().run()}
        >
          <Underline size={16} />
        </Tool>
        <Drop
          label="More text effects"
          disabled={off}
          face={
            state?.sup ? (
              <Superscript size={16} />
            ) : state?.sub ? (
              <Subscript size={16} />
            ) : (
              <Strikethrough size={16} />
            )
          }
        >
          {(close) => (
            <>
              <MenuRow
                icon={<Strikethrough size={16} />}
                label="Strikethrough"
                checked={Boolean(state?.strike)}
                onPress={() => {
                  chain().toggleStrike().run();
                  close();
                }}
              />
              <MenuRow
                icon={<Superscript size={16} />}
                label="Superscript"
                checked={Boolean(state?.sup)}
                onPress={() => {
                  chain().toggleMark("superscript").run();
                  close();
                }}
              />
              <MenuRow
                icon={<Subscript size={16} />}
                label="Subscript"
                checked={Boolean(state?.sub)}
                onPress={() => {
                  chain().toggleMark("subscript").run();
                  close();
                }}
              />
            </>
          )}
        </Drop>
        <Drop
          label="Text colour"
          disabled={off}
          face={
            <span className="ribbon-ink">
              A<i style={{ background: state?.color || "currentColor" }} />
            </span>
          }
        >
          {(close) => (
            <Swatches
              colors={INKS}
              none="Automatic"
              onPick={(value) => {
                if (value) chain().setColor(value).run();
                else chain().unsetColor().run();
                close();
              }}
            />
          )}
        </Drop>
        <Drop
          label="Highlight"
          disabled={off}
          face={
            <span className="ribbon-ink">
              <Highlighter size={15} />
              <i style={{ background: state?.marker || "#fff27a" }} />
            </span>
          }
        >
          {(close) => (
            <Swatches
              colors={MARKERS}
              none="No highlight"
              onPick={(value) => {
                if (value) chain().setBackgroundColor(value).run();
                else chain().unsetBackgroundColor().run();
                close();
              }}
            />
          )}
        </Drop>
        <span className="ribbon-cluster is-clear">
          <Tool
            label="Clear formatting"
            disabled={off}
            onPress={() => {
              chain().unsetAllMarks().clearNodes().run();
              setBlock(editor!, { textAlign: null, indent: null, lineHeight: null });
            }}
          >
            <Eraser size={16} />
          </Tool>
        </span>
      </div>

      <div className="ribbon-group">
        <span className="ribbon-cluster is-align">
          <Drop
            label="Alignment"
            disabled={off}
            face={ALIGNS.find(([align]) => align === (state?.align ?? "left"))![2]}
          >
            {(close) =>
              ALIGNS.map(([align, label, icon, shortcut]) => (
                <MenuRow
                  key={align}
                  icon={icon}
                  label={label}
                  hint={keyName(shortcut)}
                  checked={state?.align === align}
                  onPress={() => {
                    setBlock(editor!, { textAlign: align === "left" ? null : align });
                    close();
                  }}
                />
              ))
            }
          </Drop>
        </span>
        <label className="ribbon-select-wrap" title="Line spacing">
          <LineSpacing size={15} />
          <select
            className="ribbon-select is-spacing"
            aria-label="Line spacing"
            disabled={off}
            value={state?.spacing ?? ""}
            onChange={(event) =>
              setBlock(editor!, {
                lineHeight: event.target.value ? Number(event.target.value) : null,
              })
            }
          >
            <option value="">Page</option>
            {SPACINGS.map((spacing) => (
              <option key={spacing} value={spacing}>
                {spacing.toFixed(spacing % 1 ? 2 : 1).replace(/0$/, "")}
              </option>
            ))}
          </select>
        </label>
        <span className="ribbon-cluster is-indent">
          <Tool
            label="Decrease indent"
            disabled={off || !state?.indent}
            onPress={() => setBlock(editor!, { indent: (state?.indent ?? 0) - 1 || null })}
          >
            <Outdent size={16} />
          </Tool>
          <Tool
            label="Increase indent"
            disabled={off || (state?.indent ?? 0) >= 8}
            onPress={() => setBlock(editor!, { indent: Math.min(8, (state?.indent ?? 0) + 1) })}
          >
            <Indent size={16} />
          </Tool>
        </span>
        <Tool
          label="Bulleted list"
          active={state?.bullets}
          disabled={off}
          onPress={() => chain().toggleBulletList().run()}
        >
          <List size={16} />
        </Tool>
        <Tool
          label="Numbered list"
          active={state?.numbers}
          disabled={off}
          onPress={() => chain().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </Tool>
      </div>

      <div className="ribbon-group">
        <span ref={citeRoot} className="relative inline-flex">
          <Drop
            label="Insert"
            disabled={off}
            face={
              <>
                <Plus size={15} />
                <span className="ribbon-word">Insert</span>
              </>
            }
          >
            {(close) => (
              <>
                <MenuRow
                  icon={<Link size={16} />}
                  label="Link"
                  hint={keyName("⌘K")}
                  onPress={() => {
                    close();
                    onLink();
                  }}
                />
                <MenuRow
                  icon={<ImagePlus size={16} />}
                  label="Picture"
                  onPress={() => {
                    close();
                    onImage();
                  }}
                />
                <MenuRow
                  icon={<Table2 size={16} />}
                  label="Table"
                  onPress={() => {
                    close();
                    chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
                  }}
                />
                <MenuRow
                  icon={<Minus size={16} />}
                  label="Line"
                  onPress={() => {
                    close();
                    chain().setHorizontalRule().run();
                  }}
                />
                <MenuRow
                  icon={<Chapters size={16} />}
                  label="Contents"
                  onPress={() => {
                    close();
                    chain().insertContent({ type: "tableOfContents" }).run();
                  }}
                />
                <MenuRow
                  icon={<PageBreak size={16} />}
                  label="Page break"
                  hint={keyName("⌘↩")}
                  onPress={() => {
                    close();
                    chain().insertContent({ type: "pageBreak" }).run();
                  }}
                />
                {/* Word's References tab, the part of it a long piece of
                  writing is held together by. */}
                <div className="menu-separator" />
                {footnotes && (
                  <MenuRow
                    icon={<Footnote size={16} />}
                    label="Footnote"
                    hint={keyName("⌥⌘F")}
                    onPress={() => {
                      close();
                      insertFootnote(editor!);
                    }}
                  />
                )}
                <MenuRow
                  icon={<Caption size={16} />}
                  label="Figure caption"
                  onPress={() => {
                    close();
                    insertCaption(editor!, "figure", page.tableCaption);
                  }}
                />
                <MenuRow
                  icon={<Caption size={16} />}
                  label="Table caption"
                  onPress={() => {
                    close();
                    insertCaption(editor!, "table", page.tableCaption);
                  }}
                />
                <MenuRow
                  icon={<CrossReference size={16} />}
                  label="Cross-reference…"
                  onPress={() => {
                    close();
                    setCiting(true);
                  }}
                />
              </>
            )}
          </Drop>
          {citing && editor && (
            <CrossReferencePicker
              from={noteId}
              onClose={() => {
                setCiting(false);
                editor.commands.focus();
              }}
              onPick={(target, label, pendingId) => {
                setCiting(false);
                insertCrossReference(editor, target, noteId, label, pendingId);
              }}
            />
          )}
        </span>
      </div>
    </div>
  );
}
