# The desktop app

Napp runs in a browser at <https://jacopo792.github.io/napp/> and as
a window on your own machine. This file is about the window: how to get it, what
it adds, what it keeps on the disk, and what to check when it misbehaves.

It is not a second product. The application lives in `packages/core/`, and the
browser and the window are two shells that mount it. Neither is allowed to fork
it, so a feature is never in one and missing from the other.

`README.md` is the project. `PRODUCT.md` says what it does. This file only says
what is different about running it in a window.

---

## Get it

**[Download the latest release](https://github.com/Jacopo792/napp/releases)**

| Platform           | File                       |
| ------------------ | -------------------------- |
| Mac, Apple Silicon | `Napp-<version>-arm64.dmg` |
| Mac, Intel         | `Napp-<version>.dmg`       |
| Windows, 64-bit    | `Napp Setup <version>.exe` |

Open the `.dmg` and drag Napp to Applications.

### macOS will ask once

The app carries an ad-hoc signature — the bundle is sealed, so macOS can see
that nothing has been altered since it was built — but there is no paid Apple
Developer ID behind that seal and it has not been notarized. So the first launch
is refused, once:

Open the app, let macOS refuse, then go to **System Settings → Privacy &
Security**, scroll to the message about Napp and press **Open Anyway**. On macOS
14 and earlier, Control-click the app in Applications and choose **Open**
instead. macOS remembers the choice and every launch after that is ordinary.

> If a build ever says **"Napp" is damaged and can't be opened**, with the Bin
> as the only button, that is a different message and a real fault: it means the
> bundle's seal does not match its contents. Releases up to and including v0.2.0
> were built without the ad-hoc signing step and said exactly that; the way past
> it was `xattr -dr com.apple.quarantine /Applications/Napp.app`, which skips
> Gatekeeper's check rather than answering it. Nobody should have to type that,
> and from the next release nobody does.

Worth saying plainly: this is the same instruction somebody would give you for a
tampered build, so take the download from this repository's Releases and nowhere
else. `SECURITY.md` records what a signature would have been worth.

### Signing in

The same account as the website. The window is a different browser as far as
Supabase is concerned, so you sign in once here even if the browser is already
signed in. The session and the selected archive persist across window closure
and application restarts. At launch the app restores them before showing the
sign-in form; Supabase renews an expired JWT using the stored refresh token.
If the server is temporarily unreachable, **Try again** retries without clearing
the saved archive. **Lock & sign out**, a configured auto-lock, or a revoked
session still require signing in again.

Preferences follow the account rather than the machine – appearance, the reading
axes, the privacy switches, and which conversations you have read – so the
window arrives set up the way you left the browser. Pane widths, collapsed
groups and expanded folders stay local, because those are facts about a screen.

---

## What the window adds

Everything below is what a desktop application has and a page cannot give
itself. None of it changes the interface.

**Native chrome, not a second app bar.** macOS keeps File, Edit, Format, View,
Window and Help in its system menu bar. Every archive command there presses the
same shortcut the interface answers to. Windows instead has one compact title
bar, coloured from the active Napp palette: there is no black File/Edit strip or
package-name label above the app. Keyboard shortcuts work on both platforms.

**A window you can move and name.** The traffic lights get a gutter of their own
in the leftmost column, which follows when you collapse the folders (⌘\) and
disappears in full screen. The header strips are the title bar, so you drag the
window by them and double-click them to zoom. The window is titled after the
note you are reading, which is what Mission Control, the Window menu and ⌘Tab
have to go on. It reopens where you left it, unless that was on a display you no
longer have attached.

**A Dock icon that tells you something.** It carries the number of remarks the
other member has left that you have not read.

**Notes that keep working offline.** A note already open stays editable through
a dropped connection and converges when it comes back. The window also notices
when _it_ has come back – from a closed lid, a changed network, or being hidden
– and reads the archive again, because a live subscription does not survive all
of those and fails silently when it does not.

**The gesture on a row.** Push a note row sideways with two fingers on the
trackpad: left uncovers Delete, right uncovers Archive. Let go partway and the
row stays open with its button showing; push it further and the action happens
on release. Trash and Archive have their own pair – restore, put back – and
deleting for good is always a press, never a swipe.

---

## Keeping it up to date

The app asks GitHub twice a working day whether a newer release exists. If one
does, a line appears above **Lock & sign out** — _Version <version> is
available_ — and opens the download page in your browser. Nothing downloads or
installs on its own yet: download the current installer, then replace the app
on macOS or run the new NSIS installer on Windows. Your notes are in the archive
and on the server, not in the bundle, so nothing is lost by replacing it.

**Napp → About Napp** gives the version you are running, and Releases gives the
latest, if you would rather ask than be told.

Automatic in-app updates are not implemented. The release page always carries
both macOS DMGs and the Windows installer; macOS automatic replacement remains
out of scope until the app has an Apple Developer ID.

---

## What it keeps on this machine

| What                  | Where                                             |
| --------------------- | ------------------------------------------------- |
| Sign-in session       | `localStorage` under the `app://notes` origin     |
| Notes and caches      | IndexedDB under the `app://notes` origin          |
| Device-local settings | `localStorage` under the same origin              |
| Window position       | `~/Library/Application Support/Napp/window.json`  |
| Everything else       | The archive, which is Supabase – not this machine |

Removing the app does not sign you out of the website and does not touch a note.
To clear the machine completely, delete
`~/Library/Application Support/Napp/`.

Note that signing out does not currently erase the cached documents; that
retention is recorded as debt in `SECURITY.md`.

---

## When it misbehaves

**It signs in and then no note ever opens.** The collaboration server refuses a
socket whose `Origin` it does not recognise, and the desktop app's origin is
`app://notes`. If the server's `ALLOWED_ORIGINS` does not contain it, every note
fails to open and nothing says why. Ask the server directly rather than reading
a dashboard – from `packages/collab-server/`, where `ws` resolves:

```bash
node -e 'import("ws").then(({default:W})=>{const s=new W("wss://notes-collab.onrender.com",{origin:"app://notes"});s.on("open",()=>{console.log("accepted");s.close()});s.on("unexpected-response",(_q,r)=>console.log("refused",r.statusCode))})'
```

`refused 403` means the origin is missing from the list.

**The first note of the day takes a minute.** The collaboration server is on a
free plan that sleeps after fifteen idle minutes and takes about fifty seconds
to wake, and an editor does not open until it has synced. The window says
"Waking the server" rather than "Connecting" once it has been waiting four
seconds, so you can tell that apart from a fault. Anything typed meanwhile is
kept and sent when it arrives. A workflow pings the server through the hours
anybody writes; the standing fix is a paid plan that does not sleep.

**An edit does not show as edited.** In a window left open for days this was a
Realtime channel that had quietly died – the change reached the database and the
list never heard about it. The window now re-reads and re-subscribes when it
comes back; if you see it again, quit and reopen, and say so, because that means
one of the three signals is not firing.

**Something looks wrong and you want to see why.** Development builds carry
View → Toggle Developer Tools. Release builds deliberately do not.

---

## Building it yourself

```bash
pnpm install
VITE_COLLAB_URL=wss://notes-collab.onrender.com pnpm build:desktop
```

The installer for the machine you are on lands in `apps/desktop/release/`.

`VITE_COLLAB_URL` is not optional and the build refuses a `localhost` one. A
packaged app carries whatever address it was built with to a machine where
nothing answers it, and the way that fails is not an error: the app signs in,
says "Waking the server", and never opens a note. `ALLOW_LOCAL_COLLAB=1` is the
way past it for a build genuinely aimed at a server on this machine.

`.env.local` also needs `VITE_WEB_ORIGIN` for the desktop build – the published
web address. An invitation is a link somebody else opens, on a machine that very
likely does not have this app, so it can never point at the window; and the
window has no address bar to read its own origin out of.

### Not built

`pnpm build:desktop` builds for the machine it runs on, and that is not
timidity. Asked for `--win` on an Apple Silicon Mac, electron-builder packs
`win-unpacked/` correctly and then dies on `makensis: spawn Unknown system error
-86` – the NSIS binary it fetches is x86_64. There is no arrangement of flags
that fixes it, which is what the release matrix is for.

Both Mac architectures are built on a tag: `release:desktop:mac` asks
electron-builder for `--arm64 --x64`, which is two `.dmg` files off one macOS
runner. `pnpm build:desktop` builds only for the machine you are standing at.

---

## Cutting a release

```bash
git tag v0.3.4
git push origin v0.3.4
```

The tag has to match the version in `apps/desktop/package.json`, because that
is what electron-builder puts in the filename and a `.dmg` called 0.0.0 hanging
under a tag called v0.3.4 is a question somebody will have to answer later.

`.github/workflows/release.yml` builds the installers from a matrix of
`macos-latest` and `windows-latest` – electron-builder cannot cross-compile
these – and publishes them to the repository's Releases.

Two things to have done first, because the tag is the moment they stop being
fixable quietly:

1. **The collaboration server has to be current.** It deploys on a push to
   `main`, not on a tag, so a client built from a tag can be ahead of the server
   it talks to. Ask what it is actually running rather than whether it is up,
   because a failed build leaves the previous instance serving and nothing
   looks wrong: `render deploys list <service-id>`.
2. **Migrations have to be applied.** PostgREST fails the whole select when one
   column in the list is unknown, so a client shipped ahead of its migration
   does not lose a field, it loses the archive.

Signing, when there is a certificate: set `CSC_LINK` and `CSC_KEY_PASSWORD` in
the workflow's secrets and delete the `identity: null` line in
`apps/desktop/electron-builder.yml`. Nothing else changes.

---

## How the window is put together

For anyone reading the code rather than running the app. The engineering detail
is in `CLAUDE.md`; this is the shape.

- `apps/desktop/electron/main.js` – the window, the `app://notes` scheme, the
  save/open/print handlers. Plain JavaScript, because the main process has no
  type stripping and this file imports nothing but `electron` and `node:`.
- `apps/desktop/electron/menu.js` – the menu bar.
- `apps/desktop/electron/preload.js` – three functions and one channel, behind
  `contextIsolation` and `sandbox`.
- `apps/desktop/src/main.tsx` – nine lines that mount `packages/core/`.
- `apps/desktop/vite.config.ts` – the renderer build, and the content security
  policy that goes into the production HTML.

The renderer is served from `app://notes` rather than `file://` for two reasons
that both fail silently: the collaboration server refuses an unknown origin, and
a `file://` page is not a secure context, which means no IndexedDB and therefore
no offline notes and no stored session.
