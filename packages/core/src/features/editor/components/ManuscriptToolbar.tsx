import { MenuSurface } from "@/components/MenuSurface";
/* The writing bar of a document: what prose is written with in sight —
 * style, bold, italic, Insert — and every other way of setting a character or
 * a paragraph one press away under Aa. It was Word's Home tab in full, twenty
 * controls standing over every page, and a book is not a form.
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
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useDismiss } from "@/components/useDismiss";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Books,
  Caption,
  Check,
  ChevronDown,
  Chapters,
  CrossReference,
  Eraser,
  Footnote,
  ImagePlus,
  Indent,
  Italic,
  LineSpacing,
  Link,
  List,
  ListOrdered,
  Quote,
  Minus,
  Outdent,
  PageBreak,
  Plus,
  Review,
  Search,
  Strikethrough,
  Subscript,
  Superscript,
  Table2,
  Underline,
  X,
} from "@/components/icons";
import { WRITING_FONTS, type PageSetup } from "@/lib/spaceShape";
import { insertCaption, insertCrossReference, insertFootnote } from "../lib/referenceMarks";
import { CrossReferencePicker } from "./CrossReferencePicker";
import { CitationPicker } from "./CitationPicker";
import { settle, suggestionAt, suggestionsIn } from "../lib/suggestions";
import { keyName } from "@/lib/shortcuts";
import { familyName, familyStack, localFontFamilies } from "@/lib/localFonts";
import { fold } from "@/lib/format";

const SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72];
const SPACINGS = [1, 1.15, 1.5, 2, 2.5, 3];
const PARAGRAPH_SPACES = [3, 6, 8, 10, 12, 18, 24, 36];

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

/* The paragraph styles, each drawn in its own look the way Pages lists them:
   the menu is a preview of the page, not a list of names to learn. A list is
   a style here too — it is what a paragraph *is*, which is the question the
   menu answers. The keys are Tiptap's own, said where they can be learnt. */
const STYLES = [
  { id: "h1", name: "Heading 1", key: "⌥⌘1" },
  { id: "h2", name: "Heading 2", key: "⌥⌘2" },
  { id: "h3", name: "Heading 3", key: "⌥⌘3" },
  { id: "body", name: "Body text", key: "⌥⌘0" },
  { id: "quote", name: "Block quote", key: "⇧⌘B" },
  { id: "bullets", name: "• Bulleted list", key: "⇧⌘8" },
  { id: "numbers", name: "1. Numbered list", key: "⇧⌘7" },
] as const;

type StyleId = (typeof STYLES)[number]["id"];

function setStyle(editor: Editor, id: StyleId) {
  /* From whatever the paragraph was: a heading inside a quote inside a list
     is not something anybody asked for by choosing "Heading". */
  const run = editor.chain().focus().clearNodes();
  if (id === "body") run.setParagraph().run();
  else if (id === "quote") run.setBlockquote().run();
  else if (id === "bullets") run.toggleBulletList().run();
  else if (id === "numbers") run.toggleOrderedList().run();
  else run.setHeading({ level: Number(id.slice(1)) as 1 | 2 | 3 }).run();
}

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
  className = "",
  children,
}: {
  label: string;
  face: ReactNode;
  disabled?: boolean;
  className?: string;
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
        className={`ribbon-tool press ${className} ${open ? "is-active" : ""}`}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((now) => !now)}
      >
        {face}
      </button>
      <MenuSurface
        open={open}
        role="menu"
        aria-label={label}
        className={`popover ribbon-panel ${className}`}
      >
        {children(() => setOpen(false))}
      </MenuSurface>
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

/** Every family on this machine, each set in itself — Pages' font menu. The
 *  list is asked for on the click that opens it, which is the only moment
 *  Chromium will answer (see `localFonts.ts`). It opens in place inside the
 *  Aa panel rather than as a menu off a menu. */
function FontPicker({
  font,
  disabled,
  onPick,
}: {
  font: string;
  disabled?: boolean;
  onPick: (stack: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const shut = useCallback(() => setOpen(false), []);
  const root = useDismiss(open, shut);
  const [families, setFamilies] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const name = font
    ? (WRITING_FONTS.find((one) => one.stack === font)?.name ?? familyName(font))
    : "Page font";
  const wanted = fold(query.trim());
  const shown = (families ?? []).filter((family) => fold(family).includes(wanted));
  const pick = (stack: string | null) => {
    setOpen(false);
    setQuery("");
    onPick(stack);
  };
  return (
    <div ref={root} className="font-picker">
      <button
        type="button"
        className="ribbon-select font-picker-face press"
        aria-expanded={open}
        aria-label="Font"
        disabled={disabled}
        style={{ fontFamily: font || undefined }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((now) => !now);
          if (!families) void localFontFamilies().then(setFamilies);
        }}
      >
        <span className="truncate">{name}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="font-picker-list">
          <label className="font-picker-search">
            <Search size={13} />
            <input
              autoFocus
              value={query}
              placeholder="Search fonts"
              aria-label="Search fonts"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && shown[0]) pick(familyStack(shown[0]));
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setOpen(false);
                }
              }}
            />
          </label>
          <div className="font-picker-scroll" role="listbox" aria-label="Fonts">
            {!wanted && <FontRow name="Page font" checked={!font} onPress={() => pick(null)} />}
            {families === null && <p className="font-picker-note">Reading fonts…</p>}
            {shown.map((family) => {
              const stack = familyStack(family);
              return (
                <FontRow
                  key={family}
                  name={family}
                  face={stack}
                  checked={familyName(font) === family}
                  onPress={() => pick(stack)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function FontRow({
  name,
  face,
  checked,
  onPress,
}: {
  name: string;
  face?: string;
  checked: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={checked}
      className={`font-picker-row ${checked ? "is-checked" : ""}`}
      style={{ fontFamily: face }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPress}
    >
      <span className="font-picker-check">{checked && <Check size={13} />}</span>
      <span className="truncate">{name}</span>
    </button>
  );
}

/** A size in points, typed or chosen — Pages' field with its list beside it. */
function SizeField({
  points,
  disabled,
  onSize,
}: {
  points: number | null;
  disabled?: boolean;
  onSize: (pt: number | null) => void;
}) {
  const sizes = useId();
  const [text, setText] = useState(points ? String(points) : "");
  useEffect(() => setText(points ? String(points) : ""), [points]);
  const commit = (value: string) => {
    const pt = Number(value.replace(",", "."));
    if (!value.trim()) onSize(null);
    else if (pt >= 1 && pt <= 400) onSize(Math.round(pt * 2) / 2);
    else setText(points ? String(points) : "");
  };
  return (
    <>
      <input
        className="ribbon-select is-size"
        aria-label="Font size"
        list={sizes}
        disabled={disabled}
        inputMode="decimal"
        placeholder="Auto"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          /* Chosen from the list rather than typed: no Enter is coming. */
          const how = (event.nativeEvent as InputEvent).inputType;
          if (!how || how === "insertReplacementText") commit(event.target.value);
        }}
        onKeyDown={(event) => event.key === "Enter" && commit(text)}
        onBlur={() => text !== (points ? String(points) : "") && commit(text)}
      />
      <datalist id={sizes}>
        {SIZES.map((size) => (
          <option key={size} value={size} />
        ))}
      </datalist>
    </>
  );
}

/** Points before or after a paragraph. */
function SpaceField({
  label,
  value,
  onSpace,
}: {
  label: string;
  value: number | null;
  onSpace: (pt: number | null) => void;
}) {
  return (
    <label className="format-space">
      <span>{label}</span>
      <select
        className="ribbon-select"
        aria-label={`Space ${label.toLowerCase()} paragraph`}
        value={value ?? ""}
        onChange={(event) => onSpace(event.target.value ? Number(event.target.value) : null)}
      >
        <option value="">0 pt</option>
        {PARAGRAPH_SPACES.map((pt) => (
          <option key={pt} value={pt}>
            {pt} pt
          </option>
        ))}
        {value && !PARAGRAPH_SPACES.includes(value) && <option value={value}>{value} pt</option>}
      </select>
    </label>
  );
}

export function ManuscriptToolbar({
  editor,
  noteId,
  footnotes,
  citations,
  page,
  onLink,
  onImage,
  review,
}: {
  editor: Editor | null;
  /** The chapter, so a cross-reference says "in chapter 2" only of others. */
  noteId: string;
  /** The document has footnotes on. */
  footnotes: boolean;
  /** The document has citations on. */
  citations: boolean;
  /** Which side of a table its caption goes. */
  page: Pick<PageSetup, "tableCaption">;
  onLink: () => void;
  onImage: () => void;
  /** Present when the document has Suggested changes on: whether this writer
   *  is suggesting, and the switch. */
  review?: { on: boolean; toggle: () => void };
}) {
  /* Which picker is open off the Insert menu: a cross-reference or a
     citation. One slot, because the two stand in the same place. */
  const [citing, setCiting] = useState<"reference" | "source" | false>(false);
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
        block: (current.isActive("bulletList")
          ? "bullets"
          : current.isActive("orderedList")
            ? "numbers"
            : current.isActive("blockquote")
              ? "quote"
              : level
                ? `h${level}`
                : "body") as StyleId,
        font: (style.fontFamily as string | undefined) ?? "",
        size: (style.fontSize as string | undefined) ?? "",
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
        before: (blockAttribute(current, "spaceBefore") as number | null) ?? null,
        after: (blockAttribute(current, "spaceAfter") as number | null) ?? null,
        textCase: (style.textCase as string | undefined) ?? "",
        indent: (blockAttribute(current, "indent") as number | undefined) ?? 0,
        /* ponytail: a walk of the chapter per transaction. A chapter is a few
           thousand nodes; cache by doc if a long one ever makes typing lag. */
        pending: review ? suggestionsIn(current.state.doc).length : 0,
        here: review ? suggestionAt(current.state.doc, current.state.selection.from) : null,
      };
    },
  });

  const off = !editor || !state?.editable;
  const chain = () => editor!.chain().focus();
  const points = state?.size ? parseFloat(state.size) : null;

  return (
    <div className="ribbon" role="toolbar" aria-label="Formatting">
      <div className="ribbon-group">
        <Drop
          label="Paragraph style"
          disabled={off}
          className="is-style"
          face={
            <>
              <span className="truncate">
                {STYLES.find((one) => one.id === (state?.block ?? "body"))?.name}
              </span>
              <ChevronDown size={12} />
            </>
          }
        >
          {(close) =>
            STYLES.map((style) => (
              <button
                key={style.id}
                type="button"
                role="menuitemradio"
                aria-checked={state?.block === style.id}
                className={`style-row is-${style.id} ${state?.block === style.id ? "is-checked" : ""}`}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setStyle(editor!, style.id);
                  close();
                }}
              >
                <span className="style-row-check">
                  {state?.block === style.id && <Check size={13} />}
                </span>
                <span className="style-row-name">{style.name}</span>
                <span className="readout style-row-key">{style.key}</span>
              </button>
            ))
          }
        </Drop>
      </div>

      {/* The face and its size stand in the bar when it has the room —
          they are what a writer reaches for most after the style, and a wide
          bar with them folded away under Aa was a strip of nothing. Narrow,
          they go back into Aa. */}
      <div className="ribbon-group is-type">
        <FontPicker
          font={state?.font ?? ""}
          disabled={off}
          onPick={(stack) => {
            if (stack) chain().setFontFamily(stack).run();
            else chain().unsetFontFamily().run();
          }}
        />
        <SizeField
          points={points}
          disabled={off}
          onSize={(pt) => {
            if (pt) chain().setFontSize(`${pt}pt`).run();
            else chain().unsetFontSize().run();
          }}
        />
      </div>

      <div className="ribbon-group is-character">
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
        {/* Everything else a character or a paragraph can be set with, in
            one panel: prose is written in a style, bold and italic, and a bar
            that showed twenty more controls all the time was a form to fill
            in above every page. */}
        <Drop label="Format" disabled={off} face={<span className="ribbon-letters">Aa</span>}>
          {() => (
            <div className="format-panel">
              <div className="format-row is-type">
                <FontPicker
                  font={state?.font ?? ""}
                  onPick={(stack) => {
                    if (stack) chain().setFontFamily(stack).run();
                    else chain().unsetFontFamily().run();
                  }}
                />
                <SizeField
                  points={points}
                  onSize={(pt) => {
                    if (pt) chain().setFontSize(`${pt}pt`).run();
                    else chain().unsetFontSize().run();
                  }}
                />
              </div>
              <div className="format-row">
                <Tool
                  label="Underline"
                  shortcut="⌘U"
                  active={state?.underline}
                  onPress={() => chain().toggleUnderline().run()}
                >
                  <Underline size={16} />
                </Tool>
                <Tool
                  label="Strikethrough"
                  active={state?.strike}
                  onPress={() => chain().toggleStrike().run()}
                >
                  <Strikethrough size={16} />
                </Tool>
                <Tool
                  label="Superscript"
                  active={state?.sup}
                  onPress={() => chain().toggleMark("superscript").run()}
                >
                  <Superscript size={16} />
                </Tool>
                <Tool
                  label="Subscript"
                  active={state?.sub}
                  onPress={() => chain().toggleMark("subscript").run()}
                >
                  <Subscript size={16} />
                </Tool>
                <Tool
                  label="Clear formatting"
                  onPress={() => {
                    chain().unsetAllMarks().clearNodes().run();
                    setBlock(editor!, {
                      textAlign: null,
                      indent: null,
                      lineHeight: null,
                      spaceBefore: null,
                      spaceAfter: null,
                    });
                  }}
                >
                  <Eraser size={16} />
                </Tool>
              </div>
              <div className="format-row">
                <label className="format-space is-wide">
                  <span>Capitals</span>
                  <select
                    className="ribbon-select"
                    aria-label="Capitals"
                    value={state?.textCase ?? ""}
                    onChange={(event) =>
                      chain()
                        .setMark("textStyle", { textCase: event.target.value || null })
                        .removeEmptyTextStyle()
                        .run()
                    }
                  >
                    <option value="">None</option>
                    <option value="upper">All caps</option>
                    <option value="small">Small caps</option>
                  </select>
                </label>
              </div>
              <div className="format-row">
                {ALIGNS.map(([align, label, icon, shortcut]) => (
                  <Tool
                    key={align}
                    label={label}
                    shortcut={shortcut}
                    active={(state?.align ?? "left") === align}
                    onPress={() =>
                      setBlock(editor!, { textAlign: align === "left" ? null : align })
                    }
                  >
                    {icon}
                  </Tool>
                ))}
                <label className="ribbon-select-wrap" title="Line spacing">
                  <LineSpacing size={15} />
                  <select
                    className="ribbon-select is-spacing"
                    aria-label="Line spacing"
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
              </div>
              <div className="format-row is-spaces">
                <SpaceField
                  label="Before"
                  value={state?.before ?? null}
                  onSpace={(pt) => setBlock(editor!, { spaceBefore: pt })}
                />
                <SpaceField
                  label="After"
                  value={state?.after ?? null}
                  onSpace={(pt) => setBlock(editor!, { spaceAfter: pt })}
                />
              </div>
              <div className="format-row">
                <Tool
                  label="Bulleted list"
                  active={state?.bullets}
                  onPress={() => chain().toggleBulletList().run()}
                >
                  <List size={16} />
                </Tool>
                <Tool
                  label="Numbered list"
                  active={state?.numbers}
                  onPress={() => chain().toggleOrderedList().run()}
                >
                  <ListOrdered size={16} />
                </Tool>
                <Tool
                  label="Decrease indent"
                  disabled={!state?.indent}
                  onPress={() => setBlock(editor!, { indent: (state?.indent ?? 0) - 1 || null })}
                >
                  <Outdent size={16} />
                </Tool>
                <Tool
                  label="Increase indent"
                  disabled={(state?.indent ?? 0) >= 8}
                  onPress={() =>
                    setBlock(editor!, { indent: Math.min(8, (state?.indent ?? 0) + 1) })
                  }
                >
                  <Indent size={16} />
                </Tool>
              </div>
              <p className="format-heading">Colour</p>
              <Swatches
                colors={INKS}
                none="Automatic"
                onPick={(value) => {
                  if (value) chain().setColor(value).run();
                  else chain().unsetColor().run();
                }}
              />
              <p className="format-heading">Highlight</p>
              <Swatches
                colors={MARKERS}
                none="No highlight"
                onPick={(value) => {
                  if (value) chain().setBackgroundColor(value).run();
                  else chain().unsetBackgroundColor().run();
                }}
              />
            </div>
          )}
        </Drop>
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
                    setCiting("reference");
                  }}
                />
                {citations && (
                  <>
                    <MenuRow
                      icon={<Quote size={16} />}
                      label="Citation…"
                      onPress={() => {
                        close();
                        setCiting("source");
                      }}
                    />
                    <MenuRow
                      icon={<Books size={16} />}
                      label="Bibliography"
                      onPress={() => {
                        close();
                        chain().insertContent({ type: "bibliography" }).run();
                      }}
                    />
                  </>
                )}
              </>
            )}
          </Drop>
          {citing === "source" && editor && (
            <CitationPicker
              onClose={() => {
                setCiting(false);
                editor.commands.focus();
              }}
              onPick={(key, locator, label) => {
                setCiting(false);
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: "citation", attrs: { key, locator, label } })
                  .run();
              }}
            />
          )}
          {citing === "reference" && editor && (
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

      {/* Word's Review tab, cut to its three acts: propose instead of
          writing, and accept or reject what was proposed — the change the
          caret is in, or every one in the chapter from the menu. */}
      {review && (
        <div className="ribbon-group is-review">
          <Tool
            label={review.on ? "Suggesting — your edits are proposals" : "Suggest changes"}
            active={review.on}
            disabled={off}
            onPress={review.toggle}
          >
            <Review size={15} />
            <span className="ribbon-word">{review.on ? "Suggesting" : "Editing"}</span>
          </Tool>
          {state?.here && (
            <>
              <Tool
                label="Accept this change"
                disabled={off}
                onPress={() => editor!.view.dispatch(settle(editor!.state, [state.here!], true))}
              >
                <Check size={15} />
              </Tool>
              <Tool
                label="Reject this change"
                disabled={off}
                onPress={() => editor!.view.dispatch(settle(editor!.state, [state.here!], false))}
              >
                <X size={15} />
              </Tool>
            </>
          )}
          {(state?.pending ?? 0) > 0 && (
            <Drop
              label="All changes"
              disabled={off}
              face={
                <span className="ribbon-word">
                  {state!.pending} {state!.pending === 1 ? "change" : "changes"}
                </span>
              }
            >
              {(close) => (
                <>
                  <MenuRow
                    icon={<Check size={16} />}
                    label="Accept all"
                    onPress={() => {
                      close();
                      editor!.view.dispatch(
                        settle(editor!.state, suggestionsIn(editor!.state.doc), true),
                      );
                    }}
                  />
                  <MenuRow
                    icon={<X size={16} />}
                    label="Reject all"
                    onPress={() => {
                      close();
                      editor!.view.dispatch(
                        settle(editor!.state, suggestionsIn(editor!.state.doc), false),
                      );
                    }}
                  />
                </>
              )}
            </Drop>
          )}
        </div>
      )}
    </div>
  );
}
