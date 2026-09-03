/* The desktop window's answers. Every one of them ends at the preload bridge,
   because a renderer with `sandbox: true` holds no Node and cannot write a
   byte on its own. */
import type { Platform, SavedAs } from "@notes-app/core/platform";

interface Bridge {
  save(
    files: { name: string; data: Uint8Array }[],
    fallbackName: string,
  ): Promise<SavedAs | undefined>;
  open(name: string, bytes: Uint8Array): Promise<string | null>;
  print(): Promise<void>;
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
};
