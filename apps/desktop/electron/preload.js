/* The only opening in the wall.
 *
 * `contextIsolation` and `sandbox` are both on, so the renderer holds no Node
 * and no Electron — it holds these four functions and nothing else. Each one
 * ends in a dialog the reader answers, which is the point: the window cannot
 * write a file, only ask. */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("napp", {
  /** Bytes, not Blobs: a Blob does not survive the structured clone across
   *  this bridge, and a Uint8Array does. */
  save: (files, fallbackName) => ipcRenderer.invoke("napp:save", files, fallbackName),
  open: (name, bytes) => ipcRenderer.invoke("napp:open", name, bytes),
  print: () => ipcRenderer.invoke("napp:print"),
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
