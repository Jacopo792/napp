/* The desktop window, and the four things a window can do that a tab cannot.
 *
 * Plain JavaScript on purpose. Electron's main process has no type stripping,
 * so TypeScript here would mean a build step and a bundler for eighty lines
 * that import nothing but `electron` and `node:`. The renderer is where the
 * application is, and the renderer is TypeScript like the rest of the
 * repository.
 *
 * ── Why this does not load a file:// URL ─────────────────────────────────────
 * The collaboration server refuses a socket whose Origin is absent or not in
 * its allow-list (`originAllowed` in packages/collab-server/src/access.ts). A
 * page loaded from file:// sends no usable origin, so every note would fail to
 * open with a message that never says why. So the built renderer is served
 * from a scheme of its own, and `app://notes` is an origin the server can be
 * told about. Render's ALLOWED_ORIGINS has to contain it. */
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  net,
  protocol,
  screen,
  shell,
} = require("electron");
const { installMenu } = require("./menu");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");

/* `package.json` uses the scoped package name for tooling; the window and the
   OS must use the product name instead. */
app.setName("Napp");
const os = require("node:os");

const DEV_URL = "http://localhost:5174";
const APP_ORIGIN = "app://notes";
const isDev = !app.isPackaged;

/* A two-finger swipe on a note row files it or throws it away, and Chromium
   reads the same gesture as "go back". The row's own handler calls
   preventDefault, but overscroll navigation is decided above the page, so it
   is turned off here — there is nowhere to go back to in a window with two
   routes and a hash history. */
app.commandLine.appendSwitch("disable-features", "OverscrollHistoryNavigation");

/* Where the window was, so it opens there again. Every Mac app does this, and
   an app that forgets is an app you rearrange every morning. A file rather
   than a dependency: it is one object, written on close. */
const windowStateFile = () => path.join(app.getPath("userData"), "window.json");

function rememberedBounds() {
  try {
    const saved = JSON.parse(fsSync.readFileSync(windowStateFile(), "utf8"));
    /* A display that is gone takes its coordinates with it: a window restored
       onto a monitor that is no longer attached opens off-screen, and there is
       no way to drag back something you cannot see. */
    const visible = screen.getAllDisplays().some((display) => {
      const a = display.workArea;
      return (
        saved.x + saved.width > a.x &&
        saved.x < a.x + a.width &&
        saved.y + saved.height > a.y &&
        saved.y < a.y + a.height
      );
    });
    return visible ? saved : { width: saved.width, height: saved.height };
  } catch {
    return null;
  }
}

/* Registered before `ready`, or `protocol.handle` gets a scheme with none of
   the privileges a document needs — no fetch, no storage, no secure context,
   which means no IndexedDB and therefore no offline notes. */
protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

/* The content security policy is not here. It names the Supabase and
   collaboration origins, which are build-time values of the renderer, and this
   process is packaged without the .env they came from — a policy assembled
   here would silently lose them and block every request the app makes. It is a
   <meta> tag that vite.config.ts writes into the production HTML, where those
   values already are, and leaves out of the dev HTML, which needs the inline
   script and the websocket that hot reload is made of. */
function serveRenderer() {
  const root = path.join(__dirname, "..", "dist");
  protocol.handle("app", async (request) => {
    const { pathname } = new URL(request.url);
    /* One index.html for every path: the router is a hash history, so a real
       path only ever appears here as a mistake, and answering it with the app
       is kinder than answering it with nothing. */
    const asset = path.join(root, pathname);
    const file =
      pathname === "/" || !path.extname(pathname) ? path.join(root, "index.html") : asset;
    /* A request that climbs out of dist/ is not a request this app made. */
    if (!path.resolve(file).startsWith(path.resolve(root)))
      return new Response("", { status: 403 });
    return net.fetch(`file://${file}`);
  });
}

/* ── Whether there is a newer one ────────────────────────────────────────────
   Asked from here rather than from the page, and that is forced rather than
   preferred: the packaged renderer's content security policy (written by
   apps/desktop/vite.config.ts) names Supabase and the collaboration server,
   and widening `connect-src` to GitHub for one line of JSON widens it for
   everything the page ever loads. `net.fetch` has no policy over it.

   The answer travels one way. There is no function on the bridge for the
   renderer to call and no value for it to receive back — main sends, preload
   dispatches a DOM event, the page listens. A window with nothing to ask has
   nothing that can be asked of it. */
const RELEASES = "https://api.github.com/repos/Jacopo792/note-sharing-app/releases/latest";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/* Part by part and numerically, because 0.1.10 is newer than 0.1.9 and a
   string comparison says it is not. Anything that is not three numbers is not
   a version this understands, and the answer to a question it cannot read is
   no. */
function isNewer(tag, current) {
  const parts = (value) => String(value).replace(/^v/, "").split(".").map(Number);
  const [next, here] = [parts(tag), parts(current)];
  if (next.length !== 3 || next.some(Number.isNaN)) return false;
  for (let i = 0; i < 3; i += 1) if (next[i] !== here[i]) return next[i] > here[i];
  return false;
}

/* Remembered, because a window made later — ⌘N on macOS after the last one was
   closed — was not there when the answer arrived, and a page still loading has
   no listener yet. Both are covered by announcing again on did-finish-load. */
let pendingUpdate = null;

async function checkForUpdate() {
  try {
    const response = await net.fetch(RELEASES, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return;
    const { tag_name: tag } = await response.json();
    if (!isNewer(tag, app.getVersion())) return;
    pendingUpdate = { version: String(tag).replace(/^v/, "") };
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send("napp:update", pendingUpdate);
  } catch {
    /* No network, GitHub unreachable, a rate limit: an app that cannot ask
       whether it is current still works perfectly well as the version it is. */
  }
}

function createWindow() {
  const isMac = process.platform === "darwin";
  const isWindows = process.platform === "win32";
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    ...rememberedBounds(),
    minWidth: 640,
    minHeight: 480,
    show: false,
    /* ── Real material, not a picture of one ──────────────────────────────────
       The sidebar was a colour with a CSS blur behind it, over an opaque
       window. That is the single loudest thing separating this from Mail and
       Finder, whose sidebars are an `NSVisualEffectView`: the material picks up
       what is behind the window, desaturates when the window loses focus, and
       costs the compositor nothing because the system draws it.

       The window background has to be transparent for any of it to show — an
       opaque `backgroundColor` sits in front of the vibrant layer — so on macOS
       every surface that is not the sidebar paints its own ground in the
       stylesheet.

       `transparent: true` is required and it is easy to leave out. Electron
       honours the alpha channel of `backgroundColor` ONLY when it is set, so
       `#00000000` on its own is read as opaque black: `vibrancy` is applied,
       the material is created, and the window's own background is painted in
       front of it. Nothing errors and nothing logs — the sidebar simply looks
       exactly as it did before, which is how this was nearly shipped as
       working.

       `visualEffectState` is left unset on purpose. The default follows the
       window, which is what makes a background window's sidebar go quiet the
       way every other Mac window's does; forcing "active" is what makes a
       vibrant window look wrong. */
    backgroundColor: isMac ? "#00000000" : "#030202",
    ...(isMac ? { vibrancy: "sidebar", transparent: true } : {}),
    /* Windows owns one small native control strip, painted in the same ground
       colour as the active Napp palette. It replaces both the blue system
       frame and Electron's separate File/Edit application menu. */
    titleBarStyle: isMac ? "hiddenInset" : isWindows ? "hidden" : "default",
    ...(isWindows
      ? {
          titleBarOverlay: {
            color: "#030202",
            symbolColor: "#e8e8e8",
            height: 40,
          },
        }
      : {}),
    /* Where the three buttons sit, and it is not decoration. `hiddenInset`
       puts them at the window's own top-left, which is on top of the first row
       of the sidebar — so they are moved down to the middle of the 52px header
       strip, and the strip is given a gutter to stand in (`--titlebar-inset` in
       the stylesheet). The two numbers are one decision in two files: change
       one and the buttons are either over the avatar or floating in a gap. y is
       the top of the buttons, which are 12px, so 20 centres them in a strip
       that runs from 0 to 52. */
    ...(isMac ? { trafficLightPosition: { x: 19, y: 20 } } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  /* Painted before shown, so opening the app is not a white rectangle that
     becomes the archive a moment later. */
  window.once("ready-to-show", () => window.show());

  /* macOS takes the traffic lights away in full screen, so the gutter held for
     them has to go with them. It is stated here rather than read from CSS: the
     window is the only thing that knows, and `--titlebar-inset` and
     `trafficLightPosition` are already one decision in two files. */
  const tellFullScreen = () => window.webContents.send("napp:fullscreen", window.isFullScreen());
  window.on("enter-full-screen", tellFullScreen);
  window.on("leave-full-screen", tellFullScreen);

  /* An answer that arrived before this page had a listener for it — and the
     window's own presentation, which a fresh page has no way to ask about. */
  window.webContents.on("did-finish-load", () => {
    if (pendingUpdate) window.webContents.send("napp:update", pendingUpdate);
    tellFullScreen();
  });

  /* On close, not on every move: a resize sends a great many events and this
     is a fact worth exactly one write. `getNormalBounds` and not `getBounds`,
     or a window closed while full-screen is remembered as the whole screen and
     opens that way for ever. */
  window.on("close", () => {
    try {
      fsSync.writeFileSync(windowStateFile(), JSON.stringify(window.getNormalBounds()));
    } catch {
      /* A window that cannot write down where it was still closes. */
    }
  });

  /* A link in a note belongs to the reader's browser. Opening it in here would
     put a page nobody chose inside the application's own window, with the
     application's own permissions. */
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url);
    return { action: "deny" };
  });

  void window.loadURL(isDev ? DEV_URL : `${APP_ORIGIN}/index.html`);
  return window;
}

/* The renderer may choose colours, never window behaviour: only literal RGB
   values are accepted and only the window that sent the message is updated. */
ipcMain.on("napp:frame-theme", (event, color, symbolColor) => {
  if (process.platform !== "win32") return;
  if (!/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(symbolColor)) return;
  const window = BrowserWindow.fromWebContents(event.sender);
  window?.setTitleBarOverlay({ color, symbolColor });
});

async function chooseAndWrite(window, files, fallbackName) {
  if (files.length === 1) {
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: files[0].name,
    });
    if (canceled || !filePath) return "file";
    await fs.writeFile(filePath, Buffer.from(files[0].data));
    return "file";
  }
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: fallbackName,
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || filePaths.length === 0) return "folder";
  for (const file of files) {
    await fs.writeFile(path.join(filePaths[0], path.basename(file.name)), Buffer.from(file.data));
  }
  return "folder";
}

ipcMain.handle("napp:save", (event, files, fallbackName) =>
  chooseAndWrite(BrowserWindow.fromWebContents(event.sender), files, fallbackName),
);

/* Shown, not saved: written where the operating system keeps things it is
   allowed to throw away, then handed to whatever opens that kind of file. */
ipcMain.handle("napp:open", async (_event, name, data) => {
  const file = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "napp-")), path.basename(name));
  await fs.writeFile(file, Buffer.from(data));
  const failure = await shell.openPath(file);
  return failure || null;
});

ipcMain.handle("napp:print", (event) => {
  event.sender.print({});
});

/* ── The menu the system draws ───────────────────────────────────────────────
   The page describes a menu; macOS draws it. That is the whole of why this
   exists: an `NSMenu` is painted by the window server over the window, in the
   material the system is wearing that year, and nothing inside a renderer can
   reach past its own document to imitate it.

   The description is data off the bridge, so it is read rather than trusted —
   not because the page is hostile but because a malformed template throws in
   the main process, and a throw there closes the application. Depth is capped
   at the one level the page is allowed to describe, and the count at more
   items than any menu here has. */
const MENU_DEPTH = 2;
const MENU_ITEMS = 64;

function menuTemplate(items, chosen, depth = 1) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, MENU_ITEMS).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    if (item.type === "separator") return [{ type: "separator" }];
    if (typeof item.label !== "string" || !item.label) return [];
    const label = item.label.slice(0, 200);
    const submenu =
      depth < MENU_DEPTH && Array.isArray(item.submenu)
        ? menuTemplate(item.submenu, chosen, depth + 1)
        : null;
    if (submenu?.length) return [{ label, submenu }];
    const id = typeof item.id === "string" ? item.id : null;
    return [
      {
        label,
        enabled: item.enabled !== false && !!id,
        ...(item.checked ? { type: "checkbox", checked: true } : {}),
        click: id ? () => chosen(id) : undefined,
      },
    ];
  });
}

ipcMain.handle("napp:menu", (event, items) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) return null;
  return new Promise((resolve) => {
    /* Whichever lands first answers, and the close answers only after a tick.
       The order of `click` and the close `callback` is macOS's, not a
       guarantee: read the other way round — the menu closing before the item
       it closed on has run — `picked` is still null when the promise settles
       and every choice in the menu quietly does nothing. Written like this
       there is no order to get right. */
    let answered = false;
    const answer = (id) => {
      if (answered) return;
      answered = true;
      resolve(id);
    };
    const menu = Menu.buildFromTemplate(menuTemplate(items, answer));
    /* No coordinates: a context menu opens where the pointer already is, and
       the system knows that without our converting a client x into a screen
       one. A dismissal answers null. */
    menu.popup({ window, callback: () => setImmediate(() => answer(null)) });
  });
});

app.whenReady().then(() => {
  if (!isDev) serveRenderer();
  /* The About panel is a native window and it is free; without this it says
     "Electron" and gives the version of the runtime rather than of the app. */
  app.setAboutPanelOptions({
    applicationName: "Napp",
    applicationVersion: app.getVersion(),
    credits: "A shared archive, for the people who write in it.",
  });
  installMenu(isDev);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  /* Twice a working day. A desktop window is opened once and left open for a
     week, so asking only at launch is asking once. */
  void checkForUpdate();
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
