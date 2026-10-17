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
  "arrow.uturn.backward": "restore",
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
  plus: "add",
  "book.closed": "book",
  checkmark: "check",
  circle: "radio_button_unchecked",
  "circle.fill": "circle",
  "chevron.right": "chevron_right",
  "note.text": "description",
  clock: "schedule",
  calendar: "calendar_today",
  "calendar.badge.clock": "date_range",
  pin: "keep",
  "pin.fill": "keep",
  "pin.slash": "keep_off",
  lock: "lock",
  "lock.fill": "lock",
  "lock.open": "lock_open",
};

export function SymbolView({ name, ...props }: Omit<SymbolViewProps, "name"> & { name: SFSymbol }) {
  return <NativeSymbol {...props} name={{ ios: name, android: names[name] ?? "description" }} />;
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
