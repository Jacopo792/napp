/* SF Symbols on iOS; the matching Material symbol on Android. Toolbars need
   image sources on Android, whereas rows can draw the symbol directly. */
import { useEffect, useState } from "react";
import { Platform, type ImageSourcePropType } from "react-native";
import {
  SymbolView as NativeSymbol,
  unstable_getMaterialSymbolSourceAsync,
  type AndroidSymbol,
  type SFSymbol,
  type SymbolViewProps,
} from "expo-symbols";

const names: Partial<Record<SFSymbol, AndroidSymbol>> = {
  folder: "folder",
  flag: "flag",
  "folder.fill": "folder",
  "camera.fill": "photo_camera",
  photo: "image",
  paperclip: "attach_file",
  "square.and.arrow.up": "ios_share",
  "bubble.left.and.bubble.right": "forum",
  magnifyingglass: "search",
  bold: "format_bold",
  italic: "format_italic",
  underline: "format_underlined",
  strikethrough: "format_strikethrough",
  highlighter: "format_color_text",
  "list.bullet": "format_list_bulleted",
  "list.number": "format_list_numbered",
  "increase.indent": "format_indent_increase",
  "decrease.indent": "format_indent_decrease",
  "chevron.backward": "arrow_back",
  "circle.slash": "format_color_reset",
  "pencil.tip.crop.circle": "draw",
  "text.bubble": "add_comment",
  checklist: "checklist",
  tablecells: "table",
  link: "link",
  "arrow.down.doc": "file_download",

  "folder.badge.plus": "create_new_folder",
  archivebox: "archive",
  "archivebox.fill": "archive",
  trash: "delete",
  "trash.fill": "delete",
  "square.stack.3d.up": "stacks",
  "square.and.pencil": "edit_square",
  gearshape: "settings",
  "ellipsis.circle": "more_horiz",
  ellipsis: "more_horiz",
  "arrow.uturn.backward": "undo",
  "arrow.up.arrow.down": "swap_vert",
  "person.crop.circle": "account_circle",
  person: "person",
  "person.2": "group",
  "person.badge.plus": "person_add",
  "hand.raised": "privacy_tip",
  paintpalette: "palette",
  "textformat.size": "format_size",
  textformat: "sort_by_alpha",
  pencil: "edit",
  "rectangle.portrait.and.arrow.right": "logout",
  envelope: "mail",
  "exclamationmark.circle.fill": "error",
  plus: "add",
  "book.closed": "book",
  checkmark: "check",
  "checkmark.circle.fill": "check_circle",
  circle: "radio_button_unchecked",
  "circle.fill": "circle",
  "circle.lefthalf.filled": "contrast",
  eye: "visibility",
  "chevron.right": "chevron_right",
  "chevron.down": "expand_more",
  "chevron.up": "expand_less",
  "arrow.right": "arrow_forward",
  "note.text": "description",
  "text.alignleft": "notes",
  clock: "schedule",
  calendar: "calendar_today",
  "calendar.badge.clock": "date_range",
  pin: "keep",
  "pin.fill": "keep",
  "pin.slash": "keep_off",
  lock: "lock",
  "lock.fill": "lock",
  "lock.open": "lock_open",
  "xmark.circle.fill": "cancel",
  xmark: "close",
  "arrow.up": "arrow_upward",
  "arrow.up.forward": "north_east",
  "arrowshape.turn.up.left": "reply",
  "text.quote": "format_quote",
  "person.slash": "person_off",
  "checkmark.bubble": "mark_chat_read",
};

export function SymbolView({ name, ...props }: Omit<SymbolViewProps, "name"> & { name: SFSymbol }) {
  /* A solid form Android has no name for draws its outline. */
  const android = names[name] ?? names[name.replace(/\.fill$/, "") as SFSymbol] ?? "description";
  return <NativeSymbol {...props} name={{ ios: name, android }} />;
}

let sources: Partial<Record<SFSymbol, ImageSourcePropType>> = {};
let loading: Promise<void> | null = null;
export function useToolbarIcon() {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let live = true;
    loading ??= Promise.all(
      Object.entries(names).map(async ([name, symbol]) => {
        const source = await unstable_getMaterialSymbolSourceAsync(symbol!, 24, "#ffffff");
        if (source) sources = { ...sources, [name]: source };
      }),
    ).then(() => {});
    void loading.then(() => {
      if (live) redraw((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);
  return (name: SFSymbol) => (Platform.OS === "android" ? sources[name] : name);
}
