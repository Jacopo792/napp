/* The browser's answers. Every one of these is the code that used to sit
   inside the core, moved rather than rewritten. */
import type { Platform, SavedAs } from "@notes-app/core/platform";

/* A folder of `.md` files is what Obsidian calls a vault, so where the browser
   can write one the export writes exactly that. `showDirectoryPicker` is
   Chrome and Edge; Safari has no equivalent, and rather than sixty downloads
   in a row it falls back to one file with the notes separated by a rule. */
interface DirectoryHandle {
  getFileHandle(
    name: string,
    options: { create: boolean },
  ): Promise<{
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
}

function handOver(name: string, url: string, keepFor: number): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  /* The click is synchronous but the fetch of the blob is not, so the URL
     cannot be revoked on the next line. */
  window.setTimeout(() => URL.revokeObjectURL(url), keepFor);
}

export const webPlatform: Platform = {
  kind: "web",

  webOrigin: () => new URL(import.meta.env.BASE_URL, window.location.origin).toString(),

  inviteToken: () => new URL(window.location.href).searchParams.get("invite") ?? undefined,

  async saveFile(name, data, type = "text/markdown;charset=utf-8") {
    const blob = typeof data === "string" ? new Blob([data], { type }) : data;
    handOver(name, URL.createObjectURL(blob), 30_000);
  },

  async saveFolder(files, fallbackName): Promise<SavedAs> {
    const picker = (window as unknown as { showDirectoryPicker?: () => Promise<DirectoryHandle> })
      .showDirectoryPicker;

    if (typeof picker === "function") {
      const directory = await picker();
      for (const file of files) {
        const handle = await directory.getFileHandle(file.name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(file.text);
        await writable.close();
      }
      return "folder";
    }

    await this.saveFile(
      fallbackName,
      files.map((file) => file.text.trim()).join("\n\n---\n\n") + "\n",
    );
    return "file";
  },

  async openFile(_name, load) {
    /* Claimed inside the click, before anything is awaited: a tab opened after
       an await is a tab the pop-up blocker has already refused. */
    const opened = window.open("", "_blank");
    try {
      const url = URL.createObjectURL(await load());
      if (!opened) return "Allow pop-ups to open this attachment";
      opened.location.replace(url);
      opened.opener = null;
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
      return null;
    } catch (reason) {
      opened?.close();
      throw reason;
    }
  },

  async print() {
    window.print();
  },
};
