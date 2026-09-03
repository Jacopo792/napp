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
