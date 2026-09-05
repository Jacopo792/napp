/* The only opening in the wall.
 *
 * `contextIsolation` and `sandbox` are both on, so the renderer holds no Node
 * and no Electron — it holds these five functions and nothing else. Each one
 * ends in a dialog the reader answers, which is the point: the window cannot
 * write a file, only ask. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("napp", {
  /** Bytes, not Blobs: a Blob does not survive the structured clone across
   *  this bridge, and a Uint8Array does. */
  save: (files, fallbackName) => ipcRenderer.invoke("napp:save", files, fallbackName),
  open: (name, bytes) => ipcRenderer.invoke("napp:open", name, bytes),
  readClipboard: () => ipcRenderer.invoke("napp:clipboard"),
  print: () => ipcRenderer.invoke("napp:print"),
  /* Colour is deliberately a one-way cosmetic message, not a privileged
   * capability. The main process validates it before painting the frame. */
  setFrameTheme: (color, symbolColor) => ipcRenderer.send("napp:frame-theme", color, symbolColor),
  /* A menu the system draws, and the id of what was chosen in it. The page
   * describes the menu and hears the answer; it never holds a `Menu`. */
  popUpMenu: (items) => ipcRenderer.invoke("napp:menu", items),
});

/* The menu presses the key. Nothing here decides what a command does — the
   renderer already answers every one of these from the keyboard, and this is a
   second way to type it. Dispatched on whatever has focus, so ⌘B from the
   Format menu reaches the selection the way ⌘B from the keyboard does; on the
   body for the few items that a bare letter's own guard would otherwise hand
   back to the field it was typed in.

   The DOM is shared across the isolation boundary even though the two
   JavaScript worlds are not, so a keydown dispatched from here is a keydown the
   page's own listener sees. */
ipcRenderer.on("napp:command", (_event, init) => {
  const target = init.atBody ? document.body : (document.activeElement ?? document.body);
  target?.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }));
});

/* Whether the window is full screen, which the page cannot find out for
   itself. `@media (display-mode: fullscreen)` answers `browser` in a Chromium
   embedded this way however the window is presented — so macOS hid the traffic
   lights and the stylesheet went on holding their 88px gutter open beside
   nothing, which left the scope switch stranded to the right of an empty hole.
   The window knows; this is it saying so.

   An attribute and not an event, because it is a state and not a thing that
   happened: the stylesheet reads it the way it reads `data-shell`, and no
   component has to hold it. */
ipcRenderer.on("napp:fullscreen", (_event, on) => {
  document.documentElement.toggleAttribute("data-fullscreen", !!on);
});

/* The main process asked GitHub whether there is a newer release; this is how
   the page hears the answer. Same one-way shape as the menu above, and for the
   same reason: an event the page may listen to is not a capability the page
   holds. Nothing is added to `window.napp`, so there is nothing new to call. */
ipcRenderer.on("napp:update", (_event, detail) => {
  window.dispatchEvent(new CustomEvent("napp:update", { detail }));
});
