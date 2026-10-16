/* The phone's shell, and the whole of it.
 *
 * Android and iOS are one shell: Capacitor puts the same build in a WebView on
 * both, and what differs between them is the native project around it, not
 * this file. If a component ever appears in this directory, that is the moment
 * the shells started to diverge. */
import { createRoot } from "react-dom/client";
import { App } from "@notes-app/core";
import { setPlatform } from "@notes-app/core/platform";
import "@notes-app/core/styles.css";
import { mobilePlatform } from "./platform.mobile";

setPlatform(mobilePlatform);

/* A hash history, as on the desktop: the WebView answers files, not routes. */
createRoot(document.getElementById("root")!).render(<App history="hash" />);
