/* The phone's answers. What a browser does with a download and a new tab
   a phone does with the share sheet and Quick Look, so a file is written to the
   app's cache first and handed to whichever of the two fits. A folder is the
   one thing a phone can be asked for directly: the system picker grants this
   session a directory to write into. */
import { Directory, File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import type { Platform } from "@notes-app/core/platform";

async function cache(name: string, data: Blob | string): Promise<File> {
  const file = new File(Paths.cache, name.replace(/[/\\]/g, "-"));
  if (file.exists) file.delete();
  file.create();
  await file.write(typeof data === "string" ? data : await data.arrayBuffer());
  return file;
}

export const mobilePlatform: Platform = {
  kind: "mobile",

  /* An invitation is opened by somebody else, in a browser. */
  webOrigin: () => import.meta.env.VITE_WEB_ORIGIN as string,

  /* No deep links yet: an invitation opens on the web, where it points. */
  inviteToken: () => undefined,

  async saveFile(name, data) {
    await shareAsync((await cache(name, data)).uri);
  },

  async saveFolder(files) {
    const directory = await Directory.pickDirectoryAsync();
    for (const { name, text } of files)
      await directory.createFile(name, "text/markdown").write(text);
    return "folder";
  },

  async openFile(name, load) {
    await (await cache(name, await load())).preview();
    return null;
  },

  /* ponytail: nothing to print until the note itself is on screen, in the
     editor's WebView; Print arrives with it. */
  async print() {},
};
