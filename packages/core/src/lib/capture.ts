/* Something shared into Napp from another app — a link, a passage, a photo's
 * caption — becomes a new note.
 *
 * It arrives as `#capture?title=…&text=…&url=…`, in the fragment and never in
 * the query, because a fragment is not sent to the server: on the web that
 * server is GitHub Pages, and what somebody shares into their notes is not
 * GitHub's to log. Two doors lead here. Android's share sheet goes to
 * `share` (the manifest's share target), where the web shell's service worker
 * turns the query into this fragment without the request leaving the phone;
 * an iPhone has no share target for the web, so a Shortcut in its share sheet
 * opens the fragment directly.
 *
 * The capture is lifted out of the address before anything routes, because
 * the way to it may pass through the sign-in page, and kept for the tab until
 * an archive is open to receive it.
 *
 * Pure apart from the two storage calls, so `node --experimental-strip-types`
 * can test the shape. */

export interface Capture {
  title: string;
  text: string;
  url: string;
}

const KEY = "napp:capture";
const DOOR = "#capture?";

/** Move a capture out of the address and into this tab. Before the router. */
export function keepCapture() {
  if (typeof location === "undefined" || !location.hash.startsWith(DOOR)) return;
  const params = new URLSearchParams(location.hash.slice(DOOR.length));
  const capture: Capture = {
    title: params.get("title")?.trim() ?? "",
    text: params.get("text")?.trim() ?? "",
    url: params.get("url")?.trim() ?? "",
  };
  try {
    if (capture.title || capture.text || capture.url)
      sessionStorage.setItem(KEY, JSON.stringify(capture));
  } catch {
    /* A refused store loses the share, not the app. */
  }
  history.replaceState(history.state, "", location.pathname + location.search);
}

/** The capture waiting for this tab, once. */
export function takeCapture(): Capture | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as Capture) : null;
  } catch {
    return null;
  }
}

type Inline = { type: "text"; text: string; marks?: { type: "link"; attrs: { href: string } }[] };

/** The note a capture becomes: its title, or the first line of its words; the
 *  words as paragraphs; the address as a link, unless the words already say it. */
export function captureNote(capture: Capture) {
  const lines = capture.text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const title = capture.title || lines[0]?.slice(0, 120) || capture.url || "Shared";
  const body = capture.title ? lines : lines.slice(1);
  const paragraph = (content: Inline[]) => ({ type: "paragraph", content });
  const content = body.map((line) => paragraph([{ type: "text", text: line }]));
  if (capture.url && !capture.text.includes(capture.url))
    content.push(
      paragraph([
        {
          type: "text",
          text: capture.url,
          marks: [{ type: "link", attrs: { href: capture.url } }],
        },
      ]),
    );
  return {
    title,
    content: { type: "doc", content: content.length ? content : [{ type: "paragraph" }] },
  };
}
