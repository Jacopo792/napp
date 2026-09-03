/* The desktop shell, and the whole of it.
 *
 * Nine lines and a hash history, and that is the entire difference between the
 * app on a desktop and the app in a tab. If a component ever appears in this
 * directory, that is the moment the two shells started to diverge. */
import { createRoot } from "react-dom/client";
import { App } from "@notes-app/core";
import { setPlatform } from "@notes-app/core/platform";
import "@notes-app/core/styles.css";
import { desktopPlatform } from "./platform.desktop";

setPlatform(desktopPlatform);

/* What the stylesheet needs to know about the window it is in. A tab carries
   none of it, macOS reserves room for its traffic lights, and Windows reserves
   its compact native control strip. */
const userAgent = navigator.userAgent;
document.documentElement.dataset.shell = userAgent.includes("Mac OS X")
  ? "mac"
  : userAgent.includes("Windows")
    ? "windows"
    : "desktop";

/* A hash history, because there is no server under this window to answer a
   path: `app://notes/notes` is a request for a file that does not exist, and
   `app://notes/#/notes` is a request the document answers itself. */
createRoot(document.getElementById("root")!).render(<App history="hash" />);
