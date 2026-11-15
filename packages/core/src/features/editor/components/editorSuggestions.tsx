import { type TextColor } from "@/features/editor/lib/content";
import { blockId, readBlockLink } from "@/lib/blockLinks";
import { Extension, InputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { FormatAction } from "./RichTextEditor.types";

interface SlashCommand {
  label: string;
  detail?: string;
  action: FormatAction | "link";
}

const SLASH_COMMANDS: SlashCommand[] = [
  { label: "Heading 1", detail: "Large section title", action: "heading-1" },
  { label: "Heading 2", detail: "Section heading", action: "heading-2" },
  { label: "Heading 3", detail: "Small heading", action: "heading-3" },
  { label: "Body", detail: "Plain paragraph", action: "body" },
  { label: "Bullet list", action: "bullet-list" },
  { label: "Numbered list", action: "ordered-list" },
  { label: "Checklist", action: "checklist" },
  { label: "Quote", action: "quote" },
  { label: "Divider", action: "divider" },
  { label: "Table · 2 columns", action: "table-2" },
  { label: "Table · 3 columns", action: "table-3" },
  { label: "Table · 4 columns", action: "table-4" },
  { label: "Link", action: "link" },
  { label: "Drawing board", detail: "A sheet to sketch on", action: "drawing" },
  { label: "Draw on the page", detail: "Ink on the note itself", action: "drawing-page" },
  ...(["yellow", "purple", "pink", "orange", "mint", "blue"] as TextColor[]).map((color) => ({
    label: `${color[0].toUpperCase()}${color.slice(1)} text`,
    action: `color-${color}` as FormatAction,
  })),
];

/* `[[` opens the archive, the way `/` opens the commands — the same Suggestion
   plugin, the same popover, the same keys. The list of notes is read through a
   ref rather than closed over, so a note written a moment ago is offered
   without the editor being rebuilt: rebuilding it would destroy the ProseMirror
   instance the whole collaborative path exists to mount exactly once. */
export function noteLinkExtension(
  notes: React.RefObject<{ id: string; title: string }[]>,
  limit = 8,
) {
  return Extension.create({
    name: "noteLink",

    addInputRules() {
      return [
        new InputRule({
          find: /\[\[([^\]\n]+)#\^([A-Za-z0-9_-]{1,128})\]\]$/,
          handler: ({ range, match, chain }) => {
            const link = readBlockLink(match[0]);
            const found =
              link && notes.current.filter((note) => (note.title || "Untitled") === link.title);
            if (!link || !found || found.length !== 1) return null;
            chain()
              .deleteRange(range)
              .insertContent({
                type: "text",
                text: link.title,
                marks: [{ type: "noteLink", attrs: { noteId: found[0].id, blockId: link.id } }],
              })
              .run();
          },
        }),
      ];
    },
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("blockLinkPaste"),
          props: {
            handlePaste(view, event) {
              const link = readBlockLink(event.clipboardData?.getData("text/plain") || "");
              const found =
                link && notes.current.filter((note) => (note.title || "Untitled") === link.title);
              if (!link || !found || found.length !== 1) return false;
              const mark = view.state.schema.marks.noteLink.create({
                noteId: found[0].id,
                blockId: link.id,
              });
              view.dispatch(
                view.state.tr.replaceSelectionWith(
                  view.state.schema.text(link.title, [mark]),
                  false,
                ),
              );
              return true;
            },
          },
        }),
        Suggestion<{ id: string; title: string; blockId?: string | null }>({
          editor: this.editor,
          /* Its own key. ProseMirror refuses two plugins that share one, and
             `Suggestion` defaults every instance to `suggestion$` — so the
             slash menu and this one cannot both be nameless. */
          pluginKey: new PluginKey("noteLinkSuggestion"),
          char: "[[",
          allowedPrefixes: null,
          items: ({ query }) => {
            const [title, target] = query.split("#^");
            const q = title.toLowerCase();
            return notes.current
              .filter((note) => (note.title || "Untitled").toLowerCase().includes(q))
              .slice(0, limit)
              .map((note) => ({ ...note, blockId: blockId(target) }));
          },
          command: ({ editor, range, props }) => {
            const title = props.title || "Untitled";
            editor
              .chain()
              .focus()
              .deleteRange(range)
              .insertContent([
                {
                  type: "text",
                  marks: [
                    {
                      type: "noteLink",
                      attrs: { noteId: props.id, blockId: props.blockId ?? null },
                    },
                  ],
                  text: title,
                },
                /* A space outside the mark, so the sentence carries on next to
                   the link instead of inside it. `inclusive: false` is what
                   makes the space land outside. */
                { type: "text", text: " " },
              ])
              .run();
          },
          render: () => {
            let element: HTMLDivElement | null = null;
            let selected = 0;
            let props: SuggestionProps<{ id: string; title: string }> | null = null;
            let unmount: (() => void) | undefined;
            const render = () => {
              if (!element || !props) return;
              selected = Math.min(selected, Math.max(0, props.items.length - 1));
              element.replaceChildren(
                ...(props.items.length
                  ? props.items.map((item, index) => {
                      const button = document.createElement("button");
                      button.type = "button";
                      button.className = `menu-row text-ink-2 ${index === selected ? "is-selected" : ""}`;
                      button.textContent = item.title || "Untitled";
                      button.addEventListener("mousedown", (event) => event.preventDefault());
                      button.addEventListener("click", () => props?.command(item));
                      return button;
                    })
                  : [
                      (() => {
                        const empty = document.createElement("p");
                        empty.className = "menu-note";
                        empty.textContent = "No note by that name.";
                        return empty;
                      })(),
                    ]),
              );
            };
            return {
              onStart(next) {
                props = next;
                selected = 0;
                element = document.createElement("div");
                element.className = "popover menu-popover slash-menu p-1.5";
                element.setAttribute("role", "menu");
                unmount = next.mount(element);
                render();
              },
              onUpdate(next) {
                props = next;
                render();
              },
              onKeyDown({ event }) {
                if (!props || !props.items.length) return event.key === "Escape";
                if (event.key === "ArrowDown") {
                  selected = (selected + 1) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "ArrowUp") {
                  selected = (selected - 1 + props.items.length) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "Enter") {
                  props.command(props.items[selected]);
                  return true;
                }
                return event.key === "Escape";
              },
              onExit() {
                unmount?.();
                element = null;
                props = null;
              },
            };
          },
        }),
      ];
    },
  });
}

export function slashMenuExtension(run: (action: SlashCommand["action"]) => void) {
  return Extension.create({
    name: "slashMenu",
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashCommand>({
          editor: this.editor,
          char: "/",
          allowedPrefixes: [" ", ""],
          items: ({ query }) =>
            SLASH_COMMANDS.filter((item) => item.label.toLowerCase().includes(query.toLowerCase())),
          command: ({ editor, range, props }) => {
            editor.chain().focus().deleteRange(range).run();
            run(props.action);
          },
          render: () => {
            let element: HTMLDivElement | null = null;
            let selected = 0;
            let props: SuggestionProps<SlashCommand> | null = null;
            let unmount: (() => void) | undefined;
            const render = () => {
              if (!element || !props) return;
              selected = Math.min(selected, Math.max(0, props.items.length - 1));
              element.replaceChildren(
                ...props.items.map((item, index) => {
                  const button = document.createElement("button");
                  button.type = "button";
                  button.className = `menu-row text-ink-2 ${index === selected ? "is-selected" : ""}`;
                  button.textContent = item.detail ? `${item.label} · ${item.detail}` : item.label;
                  button.addEventListener("mousedown", (event) => event.preventDefault());
                  button.addEventListener("click", () => props?.command(item));
                  return button;
                }),
              );
            };
            return {
              onStart(next) {
                props = next;
                selected = 0;
                element = document.createElement("div");
                element.className = "popover menu-popover slash-menu p-1.5";
                element.setAttribute("role", "menu");
                unmount = next.mount(element);
                render();
              },
              onUpdate(next) {
                props = next;
                render();
              },
              onKeyDown({ event }) {
                if (!props || !props.items.length) return event.key === "Escape";
                if (event.key === "ArrowDown") {
                  selected = (selected + 1) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "ArrowUp") {
                  selected = (selected - 1 + props.items.length) % props.items.length;
                  render();
                  return true;
                }
                if (event.key === "Enter") {
                  props.command(props.items[selected]);
                  return true;
                }
                return event.key === "Escape";
              },
              onExit() {
                unmount?.();
                element = null;
                props = null;
              },
            };
          },
        }),
      ];
    },
  });
}
