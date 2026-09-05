import { useEffect, useState } from "react";
import { ArrowUpCircle } from "lucide-react";

/* ── There is a newer one ────────────────────────────────────────────────────
   A tab reloads a dozen times a day and is always the version that was last
   deployed. A desktop window is installed once and can sit at a version from
   months ago without anything ever saying so — which is exactly what happened
   to the fixes that shipped to `main` and never to a release.

   Nothing here is imported from the shell and nothing is asked of it: the
   desktop main process dispatches `napp:update` on the window and this listens,
   the way the note list listens for `napp:close-other-swipes` and the drawing
   layer for `napp:take-up-the-pen`. In a browser tab nothing ever fires it, so
   this renders null for ever and costs one listener — which is why it is not a
   member of `platform.ts`: an interface with one real implementation and one
   empty one describes a habit rather than a boundary.

   A link and not a button, deliberately. Downloading is the browser's job:
   `main.js` already hands every https: window-open to the system browser, and
   in a tab this is an ordinary link. So there is no bridge to add, and no way
   for the page to start a download of its own. */

const LATEST_RELEASE = "https://github.com/Jacopo792/napp/releases/latest";

export function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    const heard = (event: Event) => {
      const detail = (event as CustomEvent<{ version?: unknown }>).detail;
      if (detail && typeof detail.version === "string") setVersion(detail.version);
    };
    window.addEventListener("napp:update", heard);
    return () => window.removeEventListener("napp:update", heard);
  }, []);

  if (!version) return null;
  return (
    <a
      className="sidebar-footer-button is-update press"
      href={LATEST_RELEASE}
      target="_blank"
      rel="noreferrer"
    >
      <ArrowUpCircle size={16} />
      <span>Version {version} is available</span>
    </a>
  );
}
