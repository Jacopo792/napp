/* The desktop window's answers. Every one of them ends at the preload bridge,
   because a renderer with `sandbox: true` holds no Node and cannot write a
   byte on its own. */
import type { Platform, SavedAs, SystemMenuItem } from "@notes-app/core/platform";

interface Bridge {
  save(
    files: { name: string; data: Uint8Array }[],
    fallbackName: string,
  ): Promise<SavedAs | undefined>;
  open(name: string, bytes: Uint8Array): Promise<string | null>;
  print(): Promise<void>;
  readClipboard(): Promise<{
    html: string;
    text: string;
    image: Uint8Array | null;
    imageType: string;
  }>;
  popUpMenu(items: SystemMenuItem[]): Promise<string | null>;
}

const bridge = (window as unknown as { napp: Bridge }).napp;

async function bytes(data: Blob | string): Promise<Uint8Array> {
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array(await data.arrayBuffer());
}

export const desktopPlatform: Platform = {
  kind: "desktop",

  /* The published site, never this window. An invitation is a link somebody
     else opens, on a machine that has a browser and very likely not this app —
     so it has to point at the web, and the desktop build is told where that is
     the same way every other origin reaches it: a build-time variable. */
  webOrigin: () => import.meta.env.VITE_WEB_ORIGIN as string,

  /* A desktop launch carries no query string. Following an invitation means
     opening the link in a browser, which is where it points anyway. Deep links
     would change this; nothing needs them yet. */
  inviteToken: () => undefined,

  async saveFile(name, data) {
    await bridge.save([{ name, data: await bytes(data) }], name);
  },

  async saveFolder(files, fallbackName) {
    const encoded = await Promise.all(
      files.map(async (file) => ({ name: file.name, data: await bytes(file.text) })),
    );
    /* A native directory dialog is on every desktop, so unlike the browser
       there is no one-file fallback to fall back to. */
    return (await bridge.save(encoded, fallbackName)) ?? "folder";
  },

  /* No pop-up blocker to race, so the bytes are simply awaited. The file is
     written somewhere disposable and handed to whatever opens that kind. */
  openFile: async (name, load) => bridge.open(name, await bytes(await load())),

  print: () => bridge.print(),
  ...(bridge
    ? {
        readClipboard: async () => {
          const data = await bridge.readClipboard();
          return {
            html: data.html,
            text: data.text,
            ...(data.image
              ? {
                  image: new File([new Uint8Array(data.image)], "Pasted image.png", {
                    type: data.imageType || "image/png",
                  }),
                }
              : {}),
          };
        },
      }
    : {}),

  /* The one member a tab has no answer for — and, it turns out, a member only
     macOS has an answer worth taking. An `NSMenu` is drawn by macOS over the
     window in the material the system is using that year, which is the whole
     argument; Windows draws its menus out of the OS theme, which is not this
     app's palette, so what the window manager offers there is a grey system
     menu hanging off a dark application. The page's own popover is the closer
     thing, and `popUpMenu` being absent is already the test every caller
     makes.

     `bridge` as well, because this module is mounted by the preview harness
     too, where there is no preload and no window manager under it. */
  ...("napp" in window && navigator.userAgent.includes("Mac OS X")
    ? { popUpMenu: (items: SystemMenuItem[]) => bridge.popUpMenu(items) }
    : {}),
};
