/* The browser's shell, and the whole of it.
 *
 * Everything this file is allowed to know is where it is running. The app is
 * `@notes-app/core`; if a component ever appears in this directory, that is
 * the moment the two shells started to diverge. */
import { createRoot } from "react-dom/client";
import { App } from "@notes-app/core";
import { setPlatform } from "@notes-app/core/platform";
import { webPlatform } from "./platform.web";
import "@notes-app/core/styles.css";

setPlatform(webPlatform);

createRoot(document.getElementById("root")!).render(<App basepath={import.meta.env.BASE_URL} />);

// Keep shared text in the browser. See public/sw.js.
if ("serviceWorker" in navigator)
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
