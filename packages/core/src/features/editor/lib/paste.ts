import { Extension } from "@tiptap/core";
import { DOMParser as ProseMirrorParser, Fragment, Slice } from "@tiptap/pm/model";
import { Plugin, type SelectionBookmark } from "@tiptap/pm/state";
import { platform } from "@/platform";
import { pasteMediaDecision } from "./pasteDecision";

type Prepared = { objectId: string; alt: string };

/** Keep the original paste selection mapped while media is saved, even if the user types. */
export function mediaPaste(options: {
  upload: (file: File) => Promise<Prepared | null>;
  load: (src: string) => Promise<Prepared | null>;
  error: (message: string) => void;
}) {
  return Extension.create({
    name: "mediaPaste",
    addProseMirrorPlugins() {
      const jobs = new Set<{ bookmark: SelectionBookmark }>();
      return [
        new Plugin({
          state: {
            init: () => null,
            apply(tr) {
              for (const job of jobs) job.bookmark = job.bookmark.map(tr.mapping);
              return null;
            },
          },
          view: () => ({ destroy: () => jobs.clear() }),
          props: {
            handlePaste(view, event) {
              if (!view.editable) return false;
              const data = event.clipboardData;
              const html = data?.getData("text/html") ?? "";
              const text = data?.getData("text/plain") ?? "";
              const files = Array.from(data?.files ?? []).filter((file) =>
                file.type.startsWith("image/"),
              );
              if (!files.length)
                for (const item of Array.from(data?.items ?? [])) {
                  const file = item.type.startsWith("image/") ? item.getAsFile() : null;
                  if (file) files.push(file);
                }
              const native = platform().readClipboard;
              const decision = pasteMediaDecision({
                html,
                text,
                fileCount: files.length,
                hasNativeClipboard: !!native,
              });
              /* Electron exposes copied rich text as HTML but can omit the
                 corresponding image File. Its native clipboard is then the
                 fallback. Do not invoke it for ordinary text/rich-text paste:
                 doing so intercepts ProseMirror's normal paste path. */
              if (!decision.handle) return false;
              event.preventDefault();
              const job = { bookmark: view.state.selection.getBookmark() };
              jobs.add(job);
              void (async () => {
                const fallback = decision.readNative && native ? await native() : null;
                const markup = html || fallback?.html || "";
                if (!files.length && fallback?.image) files.push(fallback.image);
                const dom = new DOMParser().parseFromString(markup, "text/html");
                const images = Array.from(dom.querySelectorAll("img"));
                let failure = false;
                const canUseFilesDirectly = images.length > 0 && files.length === images.length;
                for (let index = 0; index < images.length; index++) {
                  const img = images[index];
                  let prepared: Prepared | null = null;
                  try {
                    // When the clipboard carries the exact bytes (single paste from
                    // an image viewer, or a multi-image copy where the browser
                    // exposes each file alongside its <img>), those bytes are the
                    // canonical source — no round-trip through the collaboration
                    // server and no DNS-pinned fetch that might refuse the host.
                    if (canUseFilesDirectly) {
                      prepared = await options.upload(files[index]);
                    } else if (images.length === 1 && files.length === 1) {
                      prepared = await options.upload(files[0]);
                    } else {
                      const rawSrc = img.getAttribute("src") ?? "";
                      // `src` from the clipboard is raw attribute value; for a
                      // `blob:` or `data:` URL the bytes are already local, but a
                      // `blob:` created in another renderer (e.g. Chrome -> Electron)
                      // is not in this context's blob store and `fetch(blob:)` will
                      // fail — fall back to the file when we have one.
                      if (/^blob:/i.test(rawSrc) && files.length) {
                        try {
                          prepared = await options.load(rawSrc);
                        } catch {
                          prepared = await options.upload(files[0]);
                        }
                      } else {
                        prepared = await options.load(rawSrc);
                      }
                    }
                  } catch {
                    failure = true;
                  }
                  if (!prepared) {
                    failure = true;
                    img.replaceWith(
                      dom.createTextNode(
                        `[Image not copied: ${img.alt || "attach the original file"}]`,
                      ),
                    );
                    continue;
                  }
                  const saved = dom.createElement("napp-private-image");
                  saved.setAttribute("objectid", prepared.objectId);
                  saved.setAttribute("alt", img.alt || prepared.alt);
                  img.replaceWith(saved);
                }
                if (!images.length && files.length) {
                  for (const file of files) {
                    const prepared = await options.upload(file);
                    if (!prepared) {
                      failure = true;
                      continue;
                    }
                    const img = dom.createElement("napp-private-image");
                    img.setAttribute("objectid", prepared.objectId);
                    img.setAttribute("alt", prepared.alt);
                    dom.body.append(img);
                  }
                }
                if (!jobs.has(job) || view.isDestroyed || !view.editable) return;
                let slice: Slice;
                if (markup || files.length) {
                  if (!markup && text) {
                    const paragraph = dom.createElement("p");
                    paragraph.textContent = text;
                    dom.body.prepend(paragraph);
                  }
                  slice = ProseMirrorParser.fromSchema(view.state.schema).parseSlice(dom.body, {
                    preserveWhitespace: true,
                  });
                } else {
                  const nodes = (text || fallback?.text || "")
                    .split("\n")
                    .map((line) =>
                      view.state.schema.nodes.paragraph.create(
                        null,
                        line ? view.state.schema.text(line) : null,
                      ),
                    );
                  slice = new Slice(Fragment.fromArray(nodes), 1, 1);
                }
                const selection = job.bookmark.resolve(view.state.doc);
                view.dispatch(
                  view.state.tr.setSelection(selection).replaceSelection(slice).scrollIntoView(),
                );
                if (failure)
                  options.error(
                    "Some images could not be copied. Download them from the source and attach them.",
                  );
              })()
                .catch((error: unknown) => {
                  if (!view.isDestroyed)
                    options.error(error instanceof Error ? error.message : "Could not paste");
                })
                .finally(() => jobs.delete(job));
              return true;
            },
          },
        }),
      ];
    },
  });
}
