/* The menu bar, which is the difference between an application and a page.
 *
 * ── Why almost nothing here has logic ────────────────────────────────────────
 * Every item that acts on the archive is already a shortcut the renderer
 * answers to — the list lives in packages/core/src/lib/shortcuts.ts and is read
 * by the `?` sheet and by Settings, so a second copy here would be a second
 * copy and a lie. So the menu does not implement the commands. It *presses the
 * key*: `registerAccelerator: false` shows the shortcut beside the item without
 * taking it off the page, so typing ⌘N still runs the same handler it always
 * did, and clicking the item sends the same keystroke down to the renderer,
 * where the preload dispatches it on whatever has focus.
 *
 * The consequence is the point: there is exactly one implementation of "new
 * note", and a menu item cannot drift away from the key that does the same
 * thing. What is left here is the shape of a Mac menu — the roles, which are
 * Electron's and are native — and the order they go in.
 *
 * Roles register their accelerators normally, because those keys belong to the
 * system rather than to us: ⌘Z inside a contenteditable, ⌘W, Services, speech. */
const { Menu, app, shell } = require("electron");

/* Press a key at the renderer. `atBody` is for the few items that must not be
   swallowed by the guard that hands a bare letter back to the field it was
   typed in — the shortcuts sheet is opened by `?`, and `?` typed in a note is
   a question mark. */
const press = (init) => ({
  click: (_item, window) => window?.webContents.send("napp:command", init),
});

const mod = (key, extra = {}) => press({ key, metaKey: true, ...extra });

/** Items whose accelerator stays on the page, so the renderer keeps its one
 *  implementation of the command and the menu only shows where it lives. */
const item = (label, accelerator, command) => ({
  label,
  accelerator,
  registerAccelerator: false,
  ...command,
});

function template(isDev) {
  return [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        item("Settings…", "Command+,", mod(",")),
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        item("New Note", "Command+N", mod("n")),
        { type: "separator" },
        item("Save Now", "Command+S", mod("s")),
        { type: "separator" },
        /* Not a keystroke: printing is a thing the window does, and the
           renderer's own Print goes through the same preload bridge to the
           same call. `print` on a contents that is showing a note prints the
           note, because @media print is the whole of the PDF export. */
        {
          label: "Print…",
          accelerator: "Command+P",
          click: (_i, window) => window?.webContents.print({}),
        },
        { type: "separator" },
        { role: "close" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "pasteAndMatchStyle" },
        { role: "delete" },
        { role: "selectAll" },
        { type: "separator" },
        item("Find…", "Command+F", mod("f")),
        item("Search Notes and Commands…", "Command+K", mod("k")),
        { type: "separator" },
        /* What a Mac gives every text field and this window was not offering:
           the system emoji picker on ⌃⌘Space, and the substitutions AppKit
           applies as you type. All of it belongs to the operating system rather
           than to us, which is exactly why leaving it out was a hole — there is
           nothing to implement, only to expose. */
        {
          label: "Emoji & Symbols",
          accelerator: "Control+Command+Space",
          click: () => app.showEmojiPanel(),
        },
        {
          label: "Substitutions",
          submenu: [
            { role: "showSubstitutions" },
            { type: "separator" },
            { role: "toggleSmartQuotes" },
            { role: "toggleSmartDashes" },
            { role: "toggleTextReplacement" },
          ],
        },
        { label: "Speech", submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }] },
      ],
    },
    {
      label: "Format",
      submenu: [
        /* The editor's own keys. Sent rather than reimplemented for the same
           reason as everything above: Tiptap already answers all four, and the
           keystroke lands on the element that has the selection. */
        item("Bold", "Command+B", mod("b")),
        item("Italic", "Command+I", mod("i")),
        item("Underline", "Command+U", mod("u")),
        { type: "separator" },
        item("Add Link", "Command+K", mod("k")),
        { type: "separator" },
        item("Draw on the Page", "Alt+D", press({ key: "d", code: "KeyD", altKey: true })),
      ],
    },
    {
      label: "View",
      submenu: [
        item("Show or Hide Folders", "Command+\\", mod("\\")),
        item("Focus Mode", "Command+.", mod(".")),
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
        ...(isDev ? [{ type: "separator" }, { role: "reload" }, { role: "toggleDevTools" }] : []),
      ],
    },
    { label: "Window", role: "windowMenu" },
    {
      role: "help",
      submenu: [
        item("Keyboard Shortcuts", "?", press({ key: "?", shiftKey: true, atBody: true })),
        { type: "separator" },
        {
          label: "Napp on GitHub",
          click: () => void shell.openExternal("https://github.com/Jacopo792/napp"),
        },
      ],
    },
  ];
}

function installMenu(isDev) {
  /* Windows has a compact native title bar, not a second application bar above
     the archive. Keeping this empty removes Electron's File/Edit strip (and
     the package-name label it led with) while preserving the normal macOS
     menu in the system menu bar. Keyboard shortcuts still belong to the
     renderer, so this does not remove a command from the app. */
  if (process.platform === "win32") {
    Menu.setApplicationMenu(null);
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template(isDev)));
}

module.exports = { installMenu };
