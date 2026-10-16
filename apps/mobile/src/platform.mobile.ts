/* The phone's answers. A phone has no Downloads folder the reader looks in and
   no "open with" the page can reach, but it has the share sheet, and the share
   sheet is where both of those live on a phone: Save to Files, Drive, Mail, a
   PDF viewer. So every file this shell hands over is written to the app's
   cache and given to the sheet. */
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Platform } from "@notes-app/core/platform";

function base64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function cache(name: string, data: Blob | string): Promise<string> {
  const path = `share/${name.replace(/[/\\]/g, "-")}`;
  const { uri } =
    typeof data === "string"
      ? await Filesystem.writeFile({
          path,
          data,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
          recursive: true,
        })
      : await Filesystem.writeFile({
          path,
          data: await base64(data),
          directory: Directory.Cache,
          recursive: true,
        });
  return uri;
}

/* Dismissing the sheet rejects, which is the reader changing their mind and
   not an error to tell them about — the core already ignores an AbortError. */
async function share(files: string[]): Promise<void> {
  try {
    await Share.share({ files });
  } catch (reason) {
    if (/cancel/i.test(String(reason))) throw new DOMException("Dismissed", "AbortError");
    throw reason;
  }
}

export const mobilePlatform: Platform = {
  kind: "mobile",

  /* An invitation is opened by somebody else, in a browser. */
  webOrigin: () => import.meta.env.VITE_WEB_ORIGIN as string,

  /* No deep links yet: an invitation opens on the web, where it points. */
  inviteToken: () => undefined,

  async saveFile(name, data) {
    await share([await cache(name, data)]);
  },

  async saveFolder(files) {
    await share(await Promise.all(files.map((file) => cache(file.name, file.text))));
    return "folder";
  },

  /* The sheet previews a PDF or a video and offers every app that opens one. */
  async openFile(name, load) {
    await share([await cache(name, await load())]);
    return null;
  },

  /* ponytail: a WebView has no print dialog, so this does nothing; Save as PDF
     goes through the share sheet and covers printing from there. A native
     print plugin is the upgrade if the menu item is missed. */
  async print() {},
};
