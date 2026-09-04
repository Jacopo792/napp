# Repository guide

## One app, two shells

The application is `packages/core`. It is mounted by two shells that share it
and may never fork it:

|                          |                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| `packages/core`          | the app: `lib/`, `components/`, `features/editor/`, `screens/`, `styles.css`, `App.tsx`, `platform.ts` |
| `apps/web`               | the browser. Vite → GitHub Pages, exactly as before                                                    |
| `apps/desktop`           | the Electron window. macOS `.dmg`, Windows `.exe`                                                      |
| `packages/collab-server` | the Hocuspocus service (was `server/`)                                                                 |

A shell contains an `index.html`, a `main.tsx` of about nine lines, one
`platform.*.ts`, and a bundler config. **Nothing else.** A component appearing
under `apps/` is not a feature, it is the first branch of a fork — and it is
visible from the directory listing, which is the point of the shape.

That is a habit; the rule underneath it is mechanical. `eslint.config.js`
forbids `packages/core/**` from importing `electron`, `electron/*` or anything
under `apps/`, so a shell-specific import in the core fails the build with a
message naming what to do instead. CI builds **both** shells on every push for
the same reason: a change to the core that breaks the desktop renderer has to
fail in the pull request, not at the next release.

`packages/core/src/platform.ts` is what to do instead. Six members, and every
one has two real implementations from the day it was written: `webOrigin`,
`inviteToken`, `saveFile`, `saveFolder`, `openFile`, `print`. Each shell calls
`setPlatform()` before mounting.

And a seventh that is **optional**, which is a different kind of member.
`popUpMenu` hands a menu to the window manager: an `NSMenu` is painted by the
window server over the window, in the material the system is wearing that year,
and a `<div>` reaches only what is behind it in the page. There is no browser
implementation to write, so there is none — and `platform().popUpMenu` being
falsy is the capability test, where a member returning a sentinel would have
made every caller carry a third case. See _A menu, described once_ below.

**Do not widen it for something both shells do the same way.** `import.meta.env`,
`localStorage`, IndexedDB, the clipboard and the pdf.js worker are all
deliberately absent: both shells are Vite over Chromium, so those resolve
identically, and what differs is the values in a `.env` file. A member with two
identical implementations is an interface that has stopped describing a
boundary and started describing a habit.

`openFile` takes a **loader** rather than a blob, and that shape is
load-bearing: a browser must claim the new tab synchronously inside the click
or the pop-up blocker takes it, so the shell — not the caller — decides when
the bytes are fetched. A desktop window has no such rule and simply awaits.

Routing lives in `core/src/App.tsx` and a shell never imports the router: `App`
takes `history="hash"` or nothing, so the browser gets its own history and a
basepath, and the desktop window gets a hash history because there is no server
under it to answer a path. The route tree is written out rather than generated
— the file-based generator wanted a plugin in every shell's bundler config, all
writing the same `routeTree.gen.ts`. What it earned was code splitting, and
`lazyRouteComponent` keeps that; the built chunks are the proof, and the
sign-in chunk must never contain ProseMirror.

## Architecture

- React 19 + Vite SPA on GitHub Pages, plus a Node 22 Hocuspocus service in
  `packages/collab-server/`.
- Supabase supplies Auth, Postgres RLS, metadata, Realtime and private Storage.
  Yjs/Hocuspocus is authoritative for live title and content documents.
- Redis/Valkey is the bus between overlapping server instances; durable Yjs
  binaries live in `note_documents`.
- The browser gets `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
  `VITE_COLLAB_URL`. The service role key belongs only to the server.

Access control is Supabase Auth plus one table. A row in `archive_members` lets
you read the archive and write it, enforced by `private.can_write_archive()`
and by direct writes to `archive_members` being revoked entirely. `owner_id`
names which member's scope a row sits in, and a policy reads it in exactly one
place: `private.archived_note_visible()`, which withholds an archived note from
the other members when its owner has set `profiles.hide_archived`. Everywhere
else it stays a label, not a permission.

**There is no viewer.** `archive_members.role` still exists, defaults to
`editor`, and `set_archive_member_role()` still works — but the interface no
longer asks, because in an archive built for two writers the only honest answer
to "which of us is the reader" was neither. Do not re-propose the role picker.
What one member takes back from another is a note, or a passage of one; see
_Taking a note back_ below.

Notes, folder names and files are ordinary columns and Storage objects. Nothing
is encrypted; see _The retired encrypted format_ below — including the archived
notes above, which are hidden from a member, never from the database.

## Tags

There is no tag feature and there has not been one for a while, but the client
kept paying for it: `loadArchive` selected `tags` and `note_tags` in the same
`Promise.all` as everything else — two of seven queries on every archive open —
`sync.ts` subscribed to both tables so every insert into either woke a full
reload, and `persistMetaDiff` carried an upsert, a delete and an insert for
links that were always empty. Creating a note fired a redundant `note_tags`
DELETE, because a note with no row in `before` counts as "retagged".

All of that is gone from the core. **The Postgres side is untouched**: `tags`,
`note_tags`, their policies and their rows all still stand, which is what makes
this a deletion and not a migration. Re-adding the feature means re-adding the
reads. Do not re-propose the tag _interface_ — it was removed on purpose.

## Taking a note back

Two sizes, and they are held in two different places because they have to be.

`notes.locked_by` names the one account that may write a note. It is a column,
so Postgres holds it: `notes_editor_update`'s `using` keeps everybody else out
of the row, and its `with check` stops anybody locking a note in somebody
else's name or lifting a lock that is not theirs. `decideAccess` in the
collaboration server asks the same question of the document, which the service
role writes and row level security therefore never sees. Comments are outside
it on purpose — a remark is about the passage, not part of it, which is the
whole use of locking one.

A **passage** cannot be held that way. The `WriteLock` mark lives inside a Yjs
document both members are entitled to write, and no policy will ever see it, so
the boundary is the one place every update passes through:
`writeLocks.ts`, called from `beforeHandleMessage` and `afterHandleMessage`.

- It reads the **Yjs delta**, not the ProseMirror projection. Converting a whole
  note per keystroke to discover that nothing is locked is the expensive half;
  a note with no foreign lock pays one walk of the fragment and stores nothing.
- It **puts back** rather than refuses. Throwing from `beforeHandleMessage`
  closes the connection, and the client resends the same rejected update on
  reconnect, for ever. Yjs has no undo without a history to walk, so the way
  back is the way in: the remembered projection is diffed into the fragment
  with `updateYFragment`, which is what the editor's own binding does with every
  keystroke. Coarse on purpose — a broken update is reverted whole.
- The mark **excludes itself**. One passage, one holder — and that also keeps it
  out of y-prosemirror's overlapping-mark encoding, where a mark that may
  coexist with itself is stored under a key that changes per instance. A lock
  read by key would then be read by a name that moves. `CommentAnchor` sets
  `excludes: ""` and _is_ encoded that way; do not copy it here.
- The editor's `filterTransaction` is a **courtesy**, not the rule, and it must
  let transactions carrying `ySyncPluginKey` through: those are the other member
  writing their own locked passage, and refusing one leaves the editor
  disagreeing with the document it is bound to.

A note row carries no buttons on a pointer machine — everything they did is in
the row's right-click menu. The acts are also a gesture, and it is Mail's
gesture rather than a swipe of our own: push the row **left to uncover Delete**
on its right, **right to uncover Archive**. A finger drags it; a trackpad
pushes it with two fingers.

**Three behaviours, not one, and this is what the first attempt got wrong.**
The action is not a sign riding on the row, it is a surface behind it that the
row uncovers, and it grows with the travel. Let go partway and the row **stays
open** with its button showing, so the act is still a deliberate press. Push it
past `COMMIT` and it happens on release. A row that only ever sprang back said
nothing about what it was about to do, which is what made the gesture read as a
twitch rather than a control.

The directions are Apple's. They were once the other way round, on the argument
that muscle memory outranks convention; the muscle memory being protected was
of a gesture nobody could use, and the hand's real memory is of Mail. Changing
them was the report, not a liberty.

**Every scope has the gesture, and each one has its own pair.** It was the
ordinary list alone at first, on the argument that Trash and Archive have
different acts — they do, and that is a reason to give them their own pair
rather than to take the hand's gesture away in the two places a row is most
likely to want moving. The list deletes and archives, the Archive deletes and
puts back, the Trash deletes for good and restores. One rule crosses all three:
**a full swipe may not do something irreversible**, so deleting for good stays a
deliberate press however far the row is pushed.

`OPEN`, `COMMIT` and `MAX` in `NoteList.tsx` are the whole of the tuning, and
**the clamp is load-bearing**: a trackpad keeps sending decaying momentum after
the fingers lift, so unclamped travel turns a flick into a commit nobody asked
for. Clamped, a flick arrives at the open position and waits there, which is
what Mail does with the same flick.

The panels are parked outside the row's own edges (`left: 100%`, `right: 100%`)
rather than inside a wrapper, so the travelling row is the only thing that
moves and the list's own `overflow-x: hidden` is what keeps a parked panel out
of sight. A row that is open paints `--paper`, or the panel is read through it.
One row is open at a time, announced on `napp:close-other-swipes` as the
gesture starts rather than lifted into the list's state — a re-render of every
row to move one row is the wrong shape for something a hand changes constantly.

A trackpad has no gesture-end event: the fingers lift and macOS keeps sending
decaying momentum. The end is therefore a silence — 90 ms without a wheel
event — and two things follow that are easy to get wrong. The travel lives in
a **ref**, because every wheel event re-renders the row. And the settle is read
through a ref too: closed over directly it changes each render, the effect
re-runs, and its cleanup cancels the very timer that ends the gesture, so the
row travels and never springs back. Following the hand and settling afterwards
are also two motions and take two curves — `dragging` takes the transition off
while the fingers are on it, or the row snaps to its open position and the one
frame that says it was caught is lost. Chromium reads the same two-finger swipe
as "go back"; the handler calls `preventDefault` on a deliberately non-passive
listener, the list carries `overscroll-behavior-x: contain`, and the desktop
shell turns `OverscrollHistoryNavigation` off outright. Pinning has no
direction, so it keeps its button there, and Trash and Archive keep theirs.

`handleMetaChange` in `Notes.tsx` is the one place every per-note metadata
change passes through, so the lock is honoured there once rather than in each
of pinning, filing, trashing and shelving.

Both locks are offered from the ⋯ menu and the row's own right-click, and from
nowhere else — as are pinning and trashing, which is why a note row carries no
buttons of its own on a pointer machine. It keeps them under a finger, which
has no right-click to reach the menu with. The strip above the note says which state it is in and carries no
button for it: a second control up there was only a second thing to keep
agreeing with that line.

## Remarks, and knowing one is waiting

`REMARKS` is a scope, not a panel, for the same reason Trash is one — the note
list already knows how to draw notes, and a second list would be a second thing
to keep in step. It holds every note carrying a thread nobody has resolved, and
a note leaves it the moment its last thread is dealt with. Opening a note from
there opens its conversation with it.

The badge counts remarks _somebody else_ wrote, in an open thread, since this
account last opened their note. The line is a timestamp **per note**, and it
belongs to the **account**: it travels in `profile_preferences` with everything
else in _Preferences belong to the account_ below, with `localStorage` as the
device's cache for the first paint.

It was per device once, on the argument that a device looking is what it
records. It is not — having read a conversation is something a person did — and
the way that showed was installing the desktop app: it had read nothing, so it
put a badge on every conversation already read in the browser, and there was no
way to clear it but opening every note again. The web app said nothing was
waiting and the desktop app said something was, about the same archive, at the
same moment.

`mergeRemarksSeen` is the **one field in that blob that is not
last-write-wins**, and it has to be: a watermark's answer to "which of these two
is right" is neither, it is the further one. A device that has read nothing must
not un-read what the other one read. Its keys come out sorted, because the push
guard compares `JSON.stringify` output and insertion order is part of that
string.

Opening the note is what moves that note's line — not looking at the list,
which is what moved the single archive-wide line this used to keep. One line
for the archive could not say "I have read this one", so the badge stayed up
after you had read the only thing under it, and the sidebar row's tally of
notes-being-talked-about — which clears only when the last thread is resolved —
took the badge's place in the same slot and read as a stuck count. The Remarks
row now carries the dot and no tally.

The badge says how many are waiting; **the dot on the row says which**. Without
it the count is a number with nothing under it — the note that produced it looks
like every other note, and "I have read them all" is a reasonable thing to
believe. It sits on the leading slot, whichever of the three that is, because
that slot is already the one place in a row that says what you are about to
open. Opening the _list_ is not reading: only opening the note moves its line.

`refreshRemarks` is debounced by 400 ms. Realtime announces every insert,
update and delete on `note_comments` separately, so resolving a thread of six
remarks is six announcements — each one re-reading every comment in the
archive. They arrive together and are answered together.

`subscribeToComments` is a channel of its own and deliberately not another
table in `subscribeToArchive`'s list: that subscription's caller reloads the
whole archive snapshot and already fires on every save either member makes.

## A drawing in the note

A `drawing` node whose strokes are its own attribute: no Storage object, no
upload, nothing that can be missing when the note is read. It travels with the
document the way a paragraph does, and leaves in an export as inline SVG —
which, unlike `napp-image:`, carries its own bytes and renders in the vault it
lands in.

The strokes are a JSON **string**, not an array, and that is load-bearing
twice: y-prosemirror diffs node attributes with `!==`, so an array would be a
different object every comparison and would be rewritten into the document on
every keystroke anywhere in the note — and a string is something Yjs stores and
compares without knowing what is in it. `drawingStrokes()` reads rather than
trusts what comes back out, because it goes into an SVG attribute and it
arrives from the other member, an import, or whatever was on disk.

One stroke is one write, on pointer release, and the pointer is followed with
`window` listeners — never `setPointerCapture`, for the reason the cover
learned.

Two surfaces, one node. `surface: "board"` is a sheet in the flow of the note.
`surface: "page"` is the note marked up the way a screenshot is: the node view
is `position: absolute; inset: 0` against `.rich-text-content` — which is why
that rule is `position: relative` — so the layer covers the whole writing
column, run-out included, and is `pointer-events: none` until the pen is picked
up. The words underneath stay words.

- **One layer to a note.** A second is a second transparent sheet over the same
  words, and the only way to tell which you were drawing on is to draw on it.
  Asking again dispatches `napp:take-up-the-pen`; the pen is a fact about the
  hand, so it is announced, never written to the document.
- **The pen is down unless it was just asked for.** A view that picked it up
  whenever it mounted picked it up again on every return to the note, so
  somebody coming back to write drew instead. The module-level `penWanted` is
  set by the insert and read once by the view that mounts for it — a mount
  cannot tell the difference between being made and being come back to, and an
  attribute could not carry it either, because an attribute is the document and
  the document is the other member's too.
- A board measures y against its own height; a page measures **both axes
  against the width**, so it keeps its shape in a narrower column and simply
  runs past 560. `drawingBox()` gives the export the height its lowest stroke
  needs.
- The tools are `position: sticky; bottom` inside a layer as tall as the note,
  which keeps them in reach at every scroll position — a `position: fixed`
  toolbar would not know which of two open notes it belonged to.
- Six inks are one press each; every other colour is an `<input type="color">`
  **inside a label**, invisible, with the label as the swatch. Styling the
  input itself means three vendor pseudo-elements that disagree, one of which
  draws a blue halo. The ink, the nib and the highlighter are module-level, so
  what was chosen once is still chosen on the next drawing and on the other
  surface.
- The **highlighter** is one wide nib and the chosen ink with an alpha on the
  end. Translucency is a property of the colour, not a field on every stroke
  ever written — which is why `INK` admits eight hex digits as well as six.
- The eraser takes whole strokes, not pixels of them: half a line left behind
  is a line somebody has to go back for.
- **Hold still and the stroke becomes the shape it meant.** `straightenStroke`
  measures the points against a line, a rectangle and an ellipse rather than
  recognising anything, and emits the winner in `M`/`L` alone — a stored format
  that grows a curve command is a stored format every reader has to learn.
  Moving away again takes the scrawl back, because a shape you cannot refuse is
  worse than no shape.
- **Three surfaces, one hand.** `useInk` holds the ink, the nib, the eraser and
  the gesture; a board, the page and a picture in the note differ only in the
  box the strokes are measured in. A picture keeps its strokes in
  `privateImage.strokes` and they do not leave in an export, because the
  picture does not either.
- **The line being drawn is written straight onto its own element.** As React
  state it was a render of the whole layer per pointer event — sixty a second,
  each rebuilding every stroke already on the surface — and nothing outside the
  gesture depends on a line nobody has finished. It is cleared by an effect on
  `strokes`, never in the same breath as the write: clearing it there leaves a
  frame with neither, and a line that blinks out at the end of every gesture.
- **Measure the parent, not the `<svg>`.** Chrome fires no `ResizeObserver`
  callback at all — not even the first — for an SVG sized entirely by its
  parent, so a layer that measured itself stayed the shape of a board and the
  ink landed below the hand.

Searching folds the marks off its letters, both sides (`fold()` in
`format.ts`): `perche` finds "perché", which is how it is typed by anybody in a
hurry, and this archive is written in Italian.

## The shelf and the waiting room

Trash and Archive are different places and the difference is worth keeping. A
trashed note is on its way out: read-only, waiting to be deleted for good. An
archived note is filed away and still yours to edit. When a note is both, the
trash wins on screen, because being about to disappear is the more urgent thing
to say about it.

Whether the other members see your archived notes is the one boundary in this
archive that is _not_ plain membership, and it is enforced in Postgres for the
reason every boundary here is: a list filtered in the browser has already
handed the rows over. `SECURITY.md` records what the hiding is worth.

Trash empties itself after **thirty days**, once a session and only in your own
scope — the other member's browser keeps their side, and two clients racing to
delete the same rows is a second delete that finds nothing. The Trash's own
tally says so under its name: the reader is owed the fact that something will be
destroyed for them, and the line that is already there is where it goes.

Each place has one act it can perform on everything in it, in the ⋯ menu beside
"Export all as Markdown", and they are not the same kind of act: emptying the
trash destroys, clearing the archive only files everything back. Both read the
whole scope rather than the visible slice, so a search left in the box cannot
quietly narrow what "all" means, and both take the two clicks a single trashed
row already asks for. `deleteNote` is one call into `deleteNotes`, which is the
same statement with `.in` where it had `.eq`.

## Local development

```bash
cp .env.example .env.local
pnpm install
pnpm dev              # the web shell, localhost:5173
pnpm dev:desktop      # the Electron window, renderer on localhost:5174
pnpm lint
pnpm typecheck
pnpm test
pnpm test:server
pnpm build            # the web app → apps/web/dist
pnpm build:desktop    # .dmg and .exe → apps/desktop/release
```

`.env.local` needs a fourth name for the desktop build: `VITE_WEB_ORIGIN`, the
published web address. An invitation is a link somebody else opens, on a
machine that has a browser and very likely not this app, so it can never point
at the desktop window — and the desktop window has no address bar to read its
own origin out of.

`pnpm preview:ui` runs the whole interface against an in-memory fixture on
`localhost:5199`, with `@/lib/supabase`, `session`, `sync` and `presence`
swapped for the stand-ins in `preview/`. No credentials, no network. Sign in
with anything. Change a mock whenever you change the real module's shape —
`preview/supabase.mock.ts` must return a **fresh** roster array from
`loadArchive`, because handing back the same object makes every roster change
invisible to React.

## The desktop app

**It does not load `file://`, and that is not a preference.**
`originAllowed()` in `packages/collab-server/src/access.ts` refuses a socket
whose `Origin` header is absent or not in the allow-list, and a page loaded
from `file://` sends nothing usable. Every note would fail to open, with a
message that never names the cause. So `electron/main.js` registers a scheme
of its own and serves the built renderer from **`app://notes`** — an origin the
server can be told about.

Which somebody has to do by hand: `ALLOWED_ORIGINS` must contain `app://notes`
and, for development, `http://localhost:5174`. `render.yaml` records both but
**does not apply them** — the live service was made through the API, so the
value is set in the Render dashboard. The Render CLI has no env-var command, so
this cannot be scripted from here.

Until it is set the live server answers a handshake from `app://notes` with
**HTTP 403**, which is what to check first when the desktop app signs in and
then opens nothing. Asking it directly beats reading the dashboard:

```bash
node -e 'import("ws").then(({default:W})=>{const s=new W("wss://notes-collab.onrender.com",{origin:"app://notes"});s.on("open",()=>{console.log("accepted");s.close()});s.on("unexpected-response",(_q,r)=>console.log("refused",r.statusCode))})'
```

(from `packages/collab-server/`, where `ws` resolves.)

**A window is not a tab, and three of the differences are not optional.**

`electron/menu.js` builds the macOS menu bar; Windows deliberately has no
second File/Edit application strip. Almost nothing in the macOS menu has logic.
Every item that acts on the archive is already a shortcut the renderer answers
to — `packages/core/src/lib/shortcuts.ts` is the list, read by the `?` sheet and
by Settings — so the menu does not implement the commands, it **presses the
key**: `registerAccelerator: false` shows the shortcut beside the item without
taking it off the page, and clicking the item sends the same keystroke down for
the preload to dispatch on whatever has focus. One implementation of "new note",
and a menu item that cannot drift away from the key that does the same thing.
What stays a real role is what belongs to the system rather than to us: undo
inside a contenteditable, ⌘W, Services, speech, zoom, full screen.

**The three macOS buttons and `--titlebar-inset` are one decision in two files.**
`hiddenInset` leaves the traffic lights at the window's own top-left, which here
is on top of the avatar in the first row of the sidebar — the panes are cards
inset by 10px, so the window's corner is inside the first one. `main.js` moves
them to the middle of the 52px header strip with `trafficLightPosition`, and the
stylesheet holds a gutter open for them. Change one number and the buttons are
either over the avatar or floating in a gap. The gutter follows the leftmost
strip, not the sidebar: ⌘\ collapses the whole navigation pane and the buttons
are then over the note's own toolbar.

**Full screen is a fact the window states, not one the page can ask for.**
macOS hides the traffic lights in full screen, so the 88px held for them has to
go too — or the scope switch stands 88 pixels in from the edge of the screen
beside nothing. The rule for it read `@media (display-mode: fullscreen)`, and
that never once fired: Chromium answers that feature out of its own
presentation state, and a Chromium embedded in a window of our own answers
`browser` however the window is presented. So `main.js` listens for
`enter-full-screen` / `leave-full-screen` and the preload writes
`data-fullscreen` on the root element, beside `data-shell`. An attribute rather
than an event, because it is a state and not a thing that happened, and no
component has to hold it. Windows still keeps its 40px band unconditionally;
the same bug is almost certainly there and cannot be looked at from a Mac.

**Windows has a different compact strip, also one decision in two files.**
`main.js` uses `titleBarOverlay` and `styles.css` starts full-height screens
40px below it. The renderer sends only the validated palette ground and ink
through preload, so the native caption buttons match the app without gaining a
privileged renderer API.

**And a hidden title bar is a window with nothing left to drag by.** There is no
default: without `-webkit-app-region: drag` somewhere, the window cannot be
moved at all, which is the single loudest way an Electron app announces it is a
web page. The header strips are the title bar, so they drag — and everything
pressable inside them needs `no-drag`, menus included, because drag is inherited
and a menu opened from a toolbar is a descendant of it.

**The icon is cut to Apple's template, not to the edge of the canvas.** A macOS
icon is 824×824 of artwork centred in a 1024 canvas with transparent corners, so
that every icon in the Dock reads at the same size. `build/icon.png` was
full-bleed with no alpha at all, which in the Dock is a black square standing a
head taller than everything beside it. The corner is a **superellipse**, not a
rounded rectangle: the curvature runs continuously into the straight edge rather
than meeting it at a point, and that difference is most of what separates an
icon that looks drawn by Apple from one drawn by a `border-radius`.

The number on that icon is `navigator.setAppBadge`, called from the core with no
bridge and no member on `platform.ts`. It is a standard the browser has too, and
Electron implements it straight onto the Dock — a platform member for it would
have been an interface describing a habit rather than a boundary.

`data-shell` on the root element is what the stylesheet reads, set by the
desktop `main.tsx` and by nothing else, so every rule keyed on it is inert in a
tab.

The scheme is registered with `registerSchemesAsPrivileged` before `ready`.
Without that it is not a secure context, and without a secure context there is
no IndexedDB — which means no offline notes and no Supabase session. It is two
lines that look like ceremony and are not.

**A policy that allows `https://host` does not allow `wss://host`.** Chromium
does not perform the scheme-part upgrade CSP3 describes, and the way that fails
is the worst kind: the desktop app saved notes correctly, held its collaboration
socket, and silently refused Supabase Realtime — so an edit landed in Postgres
and the list never heard the row had changed. The "edited" line stayed where it
was, and it read as nothing being saved at all. The policy builder emits both
schemes for every host, and the check is one line in the page:

```js
document.addEventListener("securitypolicyviolation", (e) =>
  console.log(e.violatedDirective, e.blockedURI),
);
```

A refused socket fires that and nothing else — no exception, no console error
of its own. Reading the outcome of a `WebSocket` alone cannot tell a policy
refusal from a server that said no.

**The content security policy is written by `apps/desktop/vite.config.ts`, not
by the main process.** It names the Supabase and collaboration origins, those
are build-time values of the _renderer_, and the packaged main process has no
`.env` to read them back out of: assembled there it would silently lose them
and block every request the app makes. It goes into the production HTML only —
the dev server needs the inline script and the websocket that hot reload is
made of.

**Every dependency of `apps/desktop` is a `devDependency`,** which is not
tidiness. electron-builder ships whatever is in `dependencies`, and React and
Tiptap left there put a second, unused copy of the whole application inside the
asar: a 410 MB app around a 2 MB bundle. It is 3.8 MB now.

Builds are **unsigned**. macOS reports an unsigned `.dmg` as damaged; it opens
from the right-click menu. Signing needs an Apple Developer ID and a Windows
certificate — set `CSC_LINK` and `CSC_KEY_PASSWORD` and drop the `identity:
null` line in `apps/desktop/electron-builder.yml`, and nothing else changes.

`.github/workflows/release.yml` builds the installers on a tag, from a matrix
of `macos-latest` and `windows-latest`, because electron-builder cannot
cross-compile these. `ci.yml` builds the desktop _renderer_ on every push and
stops there.

**A packaged build refuses a `VITE_COLLAB_URL` on localhost**, and that guard
is worth its four lines. A build reads the same `.env.local` the dev server
does, and that file points the collaboration URL at a server on this machine —
so the first `.dmg` made here carried `ws://127.0.0.1:8080` to an installed
app. The way that fails is not an error: an editor opens only after the server
has synced, so the app signs in, says "Waking the server", and never opens a
note. It reads as lag. Build with the deployed server:

```bash
VITE_COLLAB_URL=wss://notes-collab.onrender.com pnpm build:desktop
```

`ALLOW_LOCAL_COLLAB=1` is the way past it for a build genuinely aimed at a
local server.

**`pnpm build:desktop` builds for the machine it is run on, and that is not
timidity.** Asked for `--win` on an Apple Silicon Mac it packs `win-unpacked/`
correctly and then dies on `makensis: spawn Unknown system error -86` —
EBADARCH, because the NSIS binary electron-builder fetches is x86_64. There is
no arrangement of flags that fixes it; the Windows installer is made on a
Windows runner, which is what the matrix is for.

## Deployment

The deployed origin is `https://jacopo792.github.io/note-sharing-app/`, and
Supabase Auth has to agree with it: the Site URL and the redirect allow-list are
what a confirmation email is built from, so a stale value there sends new
accounts to whatever was deployed last year. `supabase/config.toml` is the
source of truth and `supabase config push` applies it — the remote had been
pointing at an abandoned Vercel deployment because nobody had ever pushed it.

Note that `config push` sends the _whole_ local config, so it will also reset
anything tuned in the dashboard and never written down here. It did:
`auth.email.max_frequency`, `otp_length` and the TOTP flags all came back as CLI
defaults and had to be restored in the file. Read the diff it prints.

Pushing to `main` builds and publishes to GitHub Pages. The workflow reads
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_COLLAB_URL` from
repository variables. No service-role key, account password or archive
passphrase belongs anywhere near the build.

All three are required — `apps/web/vite.config.ts` throws on a missing one — and the
throw happens in the `deploy` job, after `checks` and `backend` are already
green. Pages then keeps serving the previous build, so the site looks healthy
while nothing has shipped. `VITE_COLLAB_URL` was missing for the whole life of
the collaboration branch and that is exactly how it read. Check the run, not the
site: `gh run list --branch main --limit 1`.

**The free plan sleeps, and that is answered in two places, neither of which
is the plan.** `.github/workflows/keep-collab-awake.yml` pings `/healthz` every
five minutes between 06:00 and 22:59 UTC — but the five minutes are the job's
own doing, not the cron's. Asked for as `*/5`, GitHub deprioritised it and gave
about one firing an hour, twice landing outside the window it declared; the
server slept through the morning of 3 September with the workflow green above
it. The schedule now asks for the hour, which GitHub honours, and the job holds
that hour with a loop, which has a clock. The loop's test is an `if` and never
`&&`: Actions runs every `run` under `bash -e`, where a false AND-list ends the
job — written that way it would have pinged once and stopped, green.

Hourly turned out to be a fiction too. On 3 September it fired **three times in
twenty-four hours** — 00:01, 13:08, 17:24 — so the server slept through a
thirteen-hour gap and a three-hour one with the workflow green above it, which
is what "the Render server does not work properly" is. There is no cron
expression that fixes a best-effort scheduler, so the job stopped trying to
cover an hour and covers **the rest of the window**: it pings until 23:00 UTC or
until it approaches the six-hour ceiling Actions puts on a job, and the schedule
asks every three hours. A firing that lands does the work of the several that
did not.

**The standing alternative is Render's `starter` plan at $7 a month**, which
does not sleep — and takes this workflow and the whole 750-hour argument with
it. Any external pinger with a real scheduler (cron-job.org, UptimeRobot) is the
other way, and needs an account nobody has made.

It is a window, not a loop around the clock, because a
workspace gets **750 free instance-hours a calendar month** across every free
web service and going over does not throttle anything, it _suspends every free
service until the month turns over_. Round-the-clock pinging spends 744 hours
in a 31-day month; this window spends about 527, against roughly 260 the
service was using on its own. `/healthz` and not `/readyz`, so a ping never
puts a query on Supabase. And the client says what the wait is: `waking` in
`collab.ts` flips after four unready seconds and the header reads "Waking the
server" instead of "Connecting", because an unexplained minute is
indistinguishable from a fault — it was being read as one.

The collaboration server is `notes-collab` on Render, in Frankfurt, built from
`packages/collab-server/Dockerfile` with the repository root as its build context, with the
Valkey instance `notes-collab-bus` beside it. `render.yaml` describes it and
does not drive it: the live service was created through the Render API, because
the CLI has no flag for a Dockerfile outside the root and the blueprint was
never connected. Editing that file changes nothing by itself. It deploys on
every push to `main`, and on the free plan it sleeps after fifteen idle minutes
and takes about fifty seconds to wake — during which no editor opens, because an
editor opens only after the server has authorized and synced.

**A service made through the API has no Git credential, and that is silent.**
It was created with a repository URL and nobody attached to it, so Render
cloned anonymously — `==> It looks like we don't have access to your repo, but
we'll try to clone it anyway` — and GitHub rate-limits unauthenticated clones
and then refuses them outright. Between 31 August and 3 September `main` took
86 commits and Render recorded **one** deploy, the one that made the service:
not eighty-six failures, none at all, because there was no identity to receive
a push event either. Nothing showed. The dashboard said the repository was
connected, because the _source_ was; what was empty was Settings → Build → Git
Credentials, whose value when unset is the button that sets it. Signing in and
pressing **Use My Credentials** fixed both halves at once.

**And it came back, with a second cause on top of it.** After the move into
`packages/`, the live service was still pointing `dockerfilePath` at
`./server/Dockerfile`, which no longer exists — so every build failed on
`lstat /opt/render/project/src/server: no such file or directory` while Render
kept the previous instance serving, and the app went on working perfectly on
code from that morning. The Render CLI has no flag for that field either, so it
is a dashboard change like `ALLOWED_ORIGINS`: **Settings → Docker → Dockerfile
Path → `./packages/collab-server/Dockerfile`**. And the anonymous-clone line was
back above it, which is the Git credential gone again: **Settings → Build → Git
Credentials → Use My Credentials**, which is also what makes a push to `main`
trigger anything at all.

Neither is catchable by CI. CI builds the image from the repository, where the
path is right; what was wrong was a value stored in Render.

The lesson is the check, not the fix: **a service that is up is not a service
that is current.** Ask `render deploys list <service-id>` what it is actually
running, the way `gh run list` is asked about Pages above.

**And a green Docker build is not a server that starts.** `COPY` is happy to
leave out a file the image needs: `server.ts` began importing `writeLocks.ts`
while the Dockerfile named `content.ts` and `ydoc.ts` by hand, so the image
built, deployed, exited on ERR_MODULE_NOT_FOUND — and Render held the previous
instance up, which is the same silence as above. The image now copies the whole
of `packages/core/src/features/editor/lib/`, and CI starts what it builds and asks it for
`/healthz`, because that is the only step that can tell the difference.

**Deploy before you drop.** The oldest client still running is whatever `main` last built,
plus anybody holding an open tab. When four `ciphertext` columns were dropped
ahead of the client that had stopped selecting them, every query the live build
made failed and the archive looked empty. The columns had to be re-added, empty,
within the hour. Merge and deploy the client that no longer asks for a column,
confirm it, and only then drop it.

**And migrate before you deploy.** The same asymmetry runs the other way, with
a narrower window: PostgREST fails the _whole_ select when one column in the
list is unknown, so a client deployed ahead of its migration does not lose a
field, it loses the archive. `archived_at` joined the select list in
`supabase.ts` before it existed in Postgres; `supabase db push --linked` has to
land first, and pushing to `main` is the deploy. Adding a column is safe for the
old build — it never asks for it — so there is no reason to do these in the
other order.

## Two seats

The archive is built for two people, and that is a database rule, not a message
in the interface:

- `archives.seat_limit` is `2` by default (`1`–`8` allowed).
- `archive_members` carries a `before insert` trigger,
  `private.enforce_archive_seats()`, which refuses a row once the archive holds
  its limit. That is the boundary — every path in, bootstrap and invitation
  redemption alike, goes through it. Re-inserting an existing member is allowed,
  because redemption uses `on conflict do nothing` and a before-insert trigger
  runs ahead of the conflict.
- `private.issue_archive_invite()` counts members plus unclaimed, unexpired
  invitations and refuses when they already fill the archive, so a link that
  could never be redeemed is never made. Re-inviting the same address reuses the
  seat that address already holds.
- Settings does the same arithmetic and closes the form first, which is a
  courtesy, not the boundary.

An unclaimed invitation holds a seat for seven days. `revoke_archive_invite()`
gives it back: it deletes the row (the stored digest goes with it, so the link
dies immediately) after checking the same editor rule that issuing checks.

## Invitations

`create_archive_invite(archive_id, email, role)` returns a 64-hex raw token
once and stores only its SHA-256 digest for seven days.
`claim_archive_invite(token)` adds the membership when the caller's Auth email
matches the invited address. The browser never resolves an address to a user id.

**Email confirmation is off**, and that is load-bearing here.
`20260830040000_invites_without_email_confirmation.sql` took the
`email_confirmed_at` check out of `private.redeem_archive_invite()`, because
leaving it in with confirmations disabled makes every invitation permanently
unclaimable — the archive looks fine and simply refuses every new member. The
two settings have to move together. Supabase's built-in mail service only
delivers to the project's own team addresses, which is why nothing arrived;
turning confirmation back on means configuring `[auth.email.smtp]` first, then
`enable_confirmations`, then restoring that check. `SECURITY.md` records what
the address check is worth without it.

The interface offers the finished invitation two ways, and neither passes the
token through an outbound service: copied by hand, or handed to a `mailto:`
that the member's own mail app composes and sends. The collaboration server has
no mail capability and never receives invitation tokens.

`pnpm add:member` is the local administrative path — it signs in as an existing
member and writes the missing row, with no service-role key.

Somebody who should use the app without reading an existing archive needs their
own archive, not a membership. `supabase/admin/new-archive-for-person.sql`
creates one from the Supabase SQL editor; the application does it atomically for
every new account, through `private.bootstrap_personal_archive()` behind
`ensure_personal_archive()`, under an advisory lock so two tabs cannot make two
archives. An account belonging to several archives picks one at sign-in; "not
connected" only means this account has no row for _this_ archive yet.

## Two people in one note

Title and content are one Yjs document. The browser holds it in memory and in
an IndexedDB store scoped by archive, account and note; Hocuspocus distributes
updates and persists the binary plus the readable Postgres projections.

The collaboration server is part of the authorization boundary:

- The caller's Supabase token is checked at connection and rechecked while the
  socket remains open. Membership allows reading; the archive role, Trash and
  archived-note visibility decide writing.
- Awareness identity is stamped by the server. Never trust a browser-provided
  nickname, account id or caret colour.
- **Postgres authorizes reading a note; the collaboration server authorizes
  writing it.** An editor mounts once `collaboration` is non-null, which is
  either when the server has synced or when this device's IndexedDB store has
  the note _and_ the note is in the catalogue RLS just returned — `entries`.
  That row is the permission: a member who has lost access is handed none, so
  no editor is built. Every write is still authorized by the server on every
  message, and `RichTextEditor` is still mounted exactly once, against one
  `Y.Doc`, and never rebuilt.
  The store is only ever a faster source for that one document, which is what
  makes it safe: the server's state arrives as a merge into the live document.
  Do **not** re-add a pre-sync editor built from the _Postgres projection_ —
  that was a second document, so it painted the note and then destroyed the
  whole ProseMirror instance to rebuild it against the Yjs fragment on
  `onSynced`. An empty store is not a hit: an empty editor is worse than the
  bars that stand in for one.
- `canEdit` is a question about the archive and the note — your role, and
  whether this is Trash. Never `&& collaborative.ready`: a sleeping Render
  instance then takes away the page's own controls, including **Add cover**,
  which writes to Postgres and never needed the socket.
- **One socket for the session, not one per note.** `collab.ts` holds a single
  module-level `HocuspocusProviderWebsocket` and gives it to every
  `HocuspocusProvider`; each note then costs an auth and a sync message on an
  open connection instead of a TCP handshake, a TLS handshake and a token round
  trip. Passing `url` instead makes the provider build and destroy its own
  socket per note, which is what made opening a note take seconds — and it let
  the free Render instance fall asleep mid-session. A supplied socket means
  `manageSocket` is false, so the provider must `attach()` itself and its
  `destroy()` leaves the socket alone. Keep `name` and `publishPresence` out of
  that effect's deps: a nickname arriving is not a reason to reconnect.
- Redis/Valkey carries Yjs and awareness updates between instances. It is not
  persistence, and the app must still work with one instance when REDIS_URL is
  absent.
- Opening, selecting, focusing or receiving an awareness update must not write
  the note or change updated_at. Only a readable document change is persisted.
- **What counts as an edit is decided by one `where` clause and one
  normalisation.** `save_note_document` restamps `updated_at` only when a
  projection differs from the stored row, so an invisible difference is a
  visible one: type a word at the end of a note and delete it again and the
  editor leaves a trailing space and an empty paragraph behind. `storeDocument`
  runs the projection through `withoutInvisibleDocumentEnding()` in
  `content.ts` — shared with the legacy draft path, which is where it used to
  live alone — before it goes to Postgres. Inside it, trimming and popping
  alternate: a trailing `"  "` paragraph does not read as empty until it is
  trimmed, and the trim reaches the last real text node only once the empty
  paragraphs after it are gone. Deleting words that were already there is still
  an edit, and `integration.test.ts` pins both halves.

The old draft/three-way merge path is compatibility code for a pre-Yjs client,
not the live writer. Do not call saveNote() from the collaborative editor.
Exports must project the live Yjs document so they include text still being
typed.

## Remarks on a passage

A comment is anchored by `CommentAnchor`, a mark in the note's own Yjs
document, and never by a stored offset: the passage keeps its comment through
every edit made above it and converges like the rest of the text. The remarks
are rows in `note_comments` joined by `thread_id`, which is that mark's id —
several rows sharing one are a conversation in `created_at` order.

The mark is in `BASE_EXTENSIONS`, not only in the editor, because the Markdown
serializer, the legacy parser, the Yjs conversion and the collaboration server
all read documents that may contain it and a schema that does not know a mark
drops it. Its `renderMarkdown` emits the words alone — a thread id in somebody
else's Obsidian is exactly the broken link `demotePrivateMedia` avoids
inventing. `exchange.test.ts` pins that.

`private.freeze_comment_record()` makes `author_id` and `body` immutable: a
policy can say who may update a row, not which columns. Resolving is any
editor's to do, deleting is the author's alone.

## Members and profiles

`public.profiles` carries a nickname and an avatar object per account.
`private.shares_archive()` lets you read the profile of someone you share an
archive with; only the account itself may write its own row. Avatars live in
their own private bucket under the owner's user id.
`packages/core/src/lib/avatarCache.ts` keeps one object URL per avatar, and Realtime keeps the
roster live.

Who is on the _note_ is a different question, and it is asked of Yjs awareness
(`useCollaborationPeers`), not of the Realtime presence channel: a peer in that
list is connected to this note's document by construction, so there is no
`noteId` filter to get wrong. Realtime presence still carries the `typing` flag
and still feeds the Settings roster.

A picture is placed before it is uploaded, not cut from the middle of the file.
`AvatarCropper` shows a round window over the image, draggable and zoomable;
`avatarCropRect()` in `packages/core/src/lib/image.ts` turns what the window shows into the
square `prepareAvatar()` cuts. Preview and output take the same three numbers,
so they cannot disagree. The math has tests in `packages/core/src/lib/image.test.ts`.

## A picture for the note, and one behind the title

They are different things and are set in different places. The **photo** is the
note's own picture, chosen from the note's context menu — where the note is
named — cut by `AvatarCropper` and shown wherever the note is named: in place of
the document glyph in the list, and beside the title on the page. The **cover**
is the band across the top of the page, set from the page, and either one of six
curated gradients or an uploaded picture with a vertical focal point.

The photo lives in `notes.page_icon`, which held the retired emoji and symbol
icons. The check in `20260831030000_note_photo.sql` was **widened** rather than
replaced: a check constraint is validated against existing rows when it is
added, so narrowing it would have refused to apply against any note that still
carried an emoji. The client reads only `{"kind":"photo","objectId":<uuid>}`;
the rest is dead shape kept alive for the rows that hold it.

Three traps, all found by the covers being unusable rather than by reading:

1. **Padding on a scrolling box is inside its height.** `.rich-text-editor` is
   `height: 100%` and `border-box`, so a `padding-bottom: 45vh` larger than the
   space the flex row gives it makes the used height the padding — the box
   overflows the pane, and the note reads as frozen. The run-out belongs to
   `.rich-text-content`.
2. **Never `setPointerCapture` on a surface that carries buttons.** A captured
   pointer retargets the click that follows to the capturing element, so every
   control on the cover went dead the moment a picture made the surface
   draggable. The `window` listeners a drag needs were doing the work anyway.
3. **Never mix the `background` shorthand with `background-position`.** React
   writes only the properties that changed, so a shorthand rewritten for a new
   picture resets the position the drag had set. Longhands only.

## Presence, and the two questions it is not one of

**Being in the archive and being in the note are different questions and they
are asked of different things.** They were once asked of one channel, and every
bug in this area came out of that.

The **archive** question is `presence.ts`: the client joins
`presence:<archiveId>` with `config.private = true` only while broadcasting its
own `{ userId, onlineAt }`, so there is no listen-only mode. It is off by
default and it draws exactly one thing — the ring on a face in the scope
switch. Nothing else may depend on it.

The **note** question is Yjs awareness, in `collab.ts`. A peer in
`useCollaborationPeers` is connected to this note's document by construction,
so there is no note filter to get wrong and no second source to be out of step
with. Awareness identity is now published **unconditionally**: gating it on the
archive-wide preference made a member vanish from the note she was typing into,
and because the gate was on the sender the other member could do nothing about
it from where she was sitting.

`typing` moved into awareness for the same reason. It is still a **flag the
writer raises and lowers**, not a timestamp — a timestamp needs a clock, an
expiry and a re-render tick in every reader to notice it lapse, for something
the writer already knows — but it now travels beside the identity it describes,
so a reader who can see the face can always see the flag. `markTyping()` in
`Notes.tsx` announces once when a burst starts and once `TYPING_IDLE_MS` after
it ends; changing note lowers it first, so it is never left raised on a page
nobody is on.

The flag is announced on the note in the **primary** column and nowhere else.
`handleSplitEdited` is `handleEdited` without the announcement, because the
flag is a fact about a document and the second pane holds a different one —
typing beside a note used to tell the other member you were writing _in_ it.
Being in the second note is still visible to her: awareness identity is
published for both documents.

What a reader is _shown_ is `flags.collaborators` — "Collaborators in notes",
the second switch in Privacy. It is one reader's own answer about their own
screen and it gates the pill and the caret extension, never the broadcast. Do
not re-gate the broadcast; that is the bug this arrangement exists to end.

`20260829250000_private_archive_presence.sql` restricts `realtime.messages` for
`extension = 'presence'` to members of the archive derived from
`realtime.topic()` via `private.presence_archive_id()` — `SELECT` to receive,
`INSERT` to publish. Postgres Changes subscriptions stay public channels
filtered by table RLS; `private_only` is not on globally, so they are undisturbed.

## Coming back

A tab is reloaded a dozen times a day. A desktop window is opened once and left
open for a week, through a closed lid, a changed network and a hotel wifi — and
a Realtime socket does not survive all of that. The way it fails is the worst
kind: the channel is gone, nothing throws, and the list simply stops hearing
that rows have changed.

That is what "editing a note no longer says edited" was, and it took a while to
find because every part of it was working. `save_note_document` stamped
`updated_at` correctly, the collaboration server persisted, the content security
policy allowed the socket (checked by opening one from `app://notes` under the
packaged policy), and the web app — freshly loaded — showed the change. The
desktop window, open since the morning, showed yesterday.

So the window is asked to notice it has come back, in `Notes.tsx`. Three
signals, because no one of them covers the three ways of leaving:

- `visibilitychange`, for a window that was hidden.
- `online`, for the network returning.
- **A clock that jumped**, which is the only one that catches a laptop whose
  lid was shut: the display slept, the window stayed "visible" the whole time,
  and nothing else fires. A tick that arrives long after it was due is a machine
  that was asleep between the two.

**A burst of saves is one read.** `refreshRemote` is debounced by 250 ms and an
announcement that lands while a read is in flight is repeated once when that
read finishes, rather than dropped — the read that was already running had asked
the database before that change, so the last word of a burst could otherwise sit
unread until something else happened to move. Somebody typing announces about
once a second, and each announcement was a whole snapshot.

Both halves matter on a wake. The snapshot is read again, because whatever
happened while we were away was never announced; and the channels are rebuilt —
the archive's and the remarks' both — because the ones we had may be listening
to nothing.

## Preferences belong to the account

`profile_preferences` is one row per account with one jsonb column, and
`accountPreferences.ts` is the only thing that reads or writes it.

**Its own table, and that is the point.** It was a column on `profiles` for
half a day, which was wrong twice over and both faults only appeared once
something wrote it often. `subscribeToArchive` treats any change to `profiles`
as a wake-up and reloads the whole archive snapshot — so dragging a colour
slider here reloaded the _other member's_ archive over there. And
`profiles_read_shared` is a row policy with no column list, so sharing an
archive would have handed her your wallpaper, your palette and your lock
timeout. Nobody else may read this table, so nobody else is woken by it.
`profiles.preferences` still exists, empty, until a client that never asks for
it has been deployed and confirmed. Appearance, the reading axes, the presence
palette and the four Privacy/Security switches all used to live in
localStorage alone, so two browsers signed into the same account disagreed
about every one of them — silently, which is what made it worth fixing: nothing
looked broken, the copies simply drifted.

Three moves and no more: **pull on sign-in** (the row wins, localStorage stays
as a cache so the first paint is not a round trip), **push on change**
(debounced, the whole blob — a per-field merge is a conflict resolver nobody
asked for), and **follow the row** (`profiles` is already published to
Realtime, and our own echo is recognised by its payload rather than by a flag,
which is what stops a loop).

The wallpaper is the one preference with bytes. The row carries only
`appearance.wallpaperObject`; the picture goes into `note-images`, the same
private per-archive bucket a photograph pasted into a note lands in, so nothing
new is granted. IndexedDB stays the device's copy and `napp:wallpaper-object`
says which shared picture that copy is. `setWallpaper()` clears the object id,
which is how the push path knows there are bytes the account has not been given.

**Never `void` a PostgREST builder.** `supabase.from(...).upsert(...)` is a
thenable, not a promise: it builds a query and sends nothing until somebody
calls `.then` on it. Written as `void supabase.from(...).upsert(...)` it makes
no HTTP request at all — and `void` also throws away the result, so a refusal
would have been exactly as quiet as sending nothing. That is how every
preference anybody set survived in React state, looked saved, and was gone on
reload while `profile_preferences` held zero rows. A fire-and-forget write is
`void write(...)` around an `async` function that **awaits** the builder and
reads `result.error`.

`mergeAccountPreferences` in `preferenceShape.ts` is deliberately in a file of
its own: `accountPreferences.ts` reaches the Supabase client, and a module that
reaches the Supabase client cannot be imported by
`node --experimental-strip-types`. The pure half is the half worth a test, and
the middle term is the subtlety — a field the row does not carry keeps the
**local** value, never the default, or signing in on the browser you have used
for a year would undo a year of choices on the strength of an empty column.

What stays local, deliberately: pane widths, collapsed groups and expanded
folders. Those are facts about a device looking. The remarks-seen stamps were on
that list and are not any more; see _Remarks, and knowing one is waiting_ above
for why, and `mergeRemarksSeen` for the one merge rule in the blob that is not
last-write-wins.

## Migrations

Every migration in `supabase/migrations/` is applied to the linked project.
Apply new ones with `supabase db push --linked`.

Two hazards, both found the hard way:

1. `supabase db query --linked` splits a file into statements and mis-pairs `$$`
   blocks when a file holds more than one. Give every function and `do` block
   its own tag (`$shares$`, `$touch$`); split a long migration if it still fails.
2. This project carries abandoned tables from earlier phases, so
   `create table if not exists` can silently do nothing against a name already
   taken by a different shape.

Hazard 2 has bitten twice. The starter scaffold's `public.profiles` was renamed
to `legacy_profiles_20260829` and replaced with a different shape — but its
`on_auth_user_created` trigger survived, still inserting into
`public.profiles (id, username, full_name, avatar_url)`. Those columns had not
existed for a day. Every insert into `auth.users` raised inside the trigger, and
GoTrue reported it as **"Database error saving new user"**: no account could be
created, and nothing in this repository explained why, because the trigger was
never in this repository. `20260830020000_two_seat_archive.sql` drops it. The
client's own `ensureProfile()` already wrote the profile row.

**When a Supabase error names a schema object you cannot find in
`supabase/migrations/`, look in the database.** `select tgname, proname from
pg_trigger join pg_proc …` found this in one query.

## A menu, described once

A menu here is drawn two ways and described once, in
`packages/core/src/lib/menuShape.ts`. The page draws it as a popover; a desktop
shell hands it to the system, which draws its own. The second cannot be
imitated by the first, which is the whole reason the boundary exists — see
`popUpMenu` in _One app, two shells_ above.

So the items are a **list**, not JSX. Writing them twice — once for
`MenuItems` and once as a template — is a fork that drifts the first time
somebody adds an item, and drifts silently, because only one of the two is ever
on screen. `forSystem()` strips the list to what a process boundary can carry,
which is also the sanitising: no icons, no functions. `useSystemMenu` offers it
and answers whether the system took it; where it did, the component renders
nothing, because the menu is already up and is not the page's to lay out.

One level of submenu. The system draws a submenu as a submenu; the page draws
it as a section you go into and come back from, because a flyout off a 240px
popover pinned to the pointer is a thing to chase rather than to read.

The main process **reads** the description rather than trusting it, and caps
its depth and its length. Not because the page is hostile but because a
malformed template throws in the main process, and a throw there closes the
application.

Icons stay in the page. An `NSMenu` item's image is a bitmap crossing a process
boundary, and the menus this one is modelled on carry none.

The pure half is its own file for the reason `preferenceShape.ts` is: it
reaches nothing, so `node --experimental-strip-types` can test it.

## Markdown in and out

`packages/core/src/features/editor/lib/exchange.ts` is the whole of this app's
interoperability, and deliberately so. Obsidian **is** a folder of `.md` files,
Notion and Google Docs both read pasted Markdown, and Apple Notes has no API —
so a file and a clipboard reach all three, and none of them needs an OAuth
client secret, a token store or a server we do not have. Do not propose an API
integration for any of them without first saying where the secret would live.

`richTextToMarkdown()` in `content.ts` serializes through the **same**
`MarkdownManager` and extension list the legacy parser reads with, so what it
writes is what `legacyMarkdownToRichText()` reads. `demotePrivateMedia()` is
the exact inverse of `promotePrivateMedia()`: a picture leaves as
`napp-image:<id>`, which round-trips through this app and is a broken link
anywhere else. Carrying the bytes means downloading and writing every Storage
blob — a larger feature, not an oversight.

A `[[note]]` link is the one mark that keeps something of itself on the way
out, and for a reason the comment anchor does not have: `[[Title]]` is
Obsidian's own syntax, so a link exported with the archive around it resolves in
the vault it lands in. One-way, deliberately — reading it back would mean
resolving a title to a note id, which needs the archive, and `content.ts` has
none and is not going to grow one. The id never leaves; a uuid in somebody
else's file is exactly the broken link `demotePrivateMedia` avoids inventing.

What points at a note is found by walking the Tiptap JSON of the notes already
in memory (`linksTo()` in `packages/core/src/lib/derived.ts`), never by querying a column: a
link is a mark inside the document, so there is nothing to index. It therefore
follows the Postgres projection, which means a link written now appears in the
other note's foot when the save lands rather than as it is typed.

Three things the tests pin: the round trip is stable, the title heading is not
left duplicated in the body, and a note link leaves as `[[Title]]` and never as
an id.

Note that `exchange.ts` and `derived.ts` import their neighbours **with the
extension**. `pnpm
test` runs under `node --experimental-strip-types`, which does not resolve an
extensionless relative import; `allowImportingTsExtensions` is already on, so
the extension costs nothing and is what makes a source file testable.

## The retired encrypted format

The archive was encrypted once and is not any more. Every note, folder, tag and
archive setting is a plaintext column; every Storage object carries its real
content type; no code under `packages/core/src/` decrypts anything. `crypto.ts` lives in
`scripts/lib/`, for the one-time migration tools that still need it.

`20260829200000_drop_the_retired_format.sql` and
`20260829210000_drop_ciphertext_after_deploy.sql` finished the job in the
database and are both applied. Two orderings in the first are load-bearing, and
both were found by the drop being refused rather than by reading the schema:
`owner` sits inside three-column unique keys that foreign keys point at, so the
dependants come out before the column; and `legacy_notes_20260828` and
`note_shares` depend on each other in both directions, so they are dropped in
one statement rather than with `cascade`.

## Migration tools

`scripts/` holds local administrative tools, not part of the deployment. Their
variables are documented in `.env.migration.example`. Never expose
`SUPABASE_SERVICE_ROLE_KEY` through a `VITE_` variable.

- `pnpm migrate:supabase` — one-off, rewraps a legacy DEK with each account
  password after an upgrade to single-step login.
- `pnpm migrate:account-only` — preflight, then `-- --apply`. Both runs print the
  same content checksum; a matching pair is the proof nothing changed but the
  encoding.
- `pnpm verify:supabase` — checks the live archive: plaintext columns,
  cross-account reads and writes, Realtime, and that anonymous and member-less
  clients still see nothing. Its Realtime check flakes about one run in three
  (the server reports SUBSCRIBED slightly before the filter is in place). A
  failure there alone, with everything above it passing, means run it again.

## What the sign-in page is allowed to import

`packages/core/src/lib/session.ts` is the login screen's entire back end and imports
`./supabaseClient` and `./noteStore` — never `./supabase`. `supabase.ts` reaches
`content.ts` for the note projection, `content.ts` builds the Tiptap schema, and
Rollup then puts all of ProseMirror in the chunk both routes share: the sign-in
form was downloading 224 kB gzipped of rich-text editor before you could type a
password. It is 59 kB now, and the editor moved into the lazy `/notes` chunk
where it belongs.

`SettingsPanel` is in a file of its own and imported with `lazy()`, mounted
only while it is open — rendered always with `open` false, it would fetch its
chunk on the way to the first note. It is one panel behind one button nobody
presses on the way to a note, and it was riding in the chunk the archive is in.
Splitting it moved 23 kB (7 kB gzipped) off the first load of `/notes`. It
still imports `Avatar` from `WorkspaceMenus`, which the rest of the interface
needs anyway.

The in-memory note cache (`noteCache`, `resetArchiveCache`, `adoptArchiveCache`)
lives in `noteStore.ts` for that reason and no other — `session.ts` has to clear
it on sign-out, and that one import was the whole rope. Keep it there.

## Flush columns, one band of chrome

The panes were rounded cards on a ground, ten pixels of air round the outside
and between them. It is a good look and it is not what a Mac application looks
like: Finder, Mail and Notes are flush columns divided by a hairline, under one
band of chrome that runs the width of the window. The floating cards were the
loudest single thing saying "this is a web page in a frame".

Nothing structural changed for it, which is the point. The three header strips
were already 52px and already side by side; taking away `.workspace-grid`'s
padding and the columns' radius is what makes them read as one toolbar, and the
hairline under **all three** is what draws the line across the window. The note's
own strip used to go without one so a cover picture was not cut by a rule —
underlined for two thirds of the window and open for the last third reads as a
mistake, and a toolbar separator over a picture is what every Mac window does.
Focus mode is the exception, where the column stops being a pane at all.

Two things that were load-bearing and are easy to undo by accident:

- **The columns carry no border.** `.sidebar-column` and its two siblings had
  `border: 1px`, which with the panes flush pushed each column's contents down
  by a pixel — so the three strips no longer agreed on where 52 pixels ended and
  the line across the window was drawn at two heights.
- **The seam is the resizer.** It was a 10px strip of the ground with a line
  down the middle on hover, which between touching panes would have been a 10px
  gap of background. So the element _is_ the 1px line, and what you can grab is
  a pseudo-element nine pixels wider overhanging both neighbours. A hairline you
  have to hit exactly is a hairline nobody moves.

The gain is not only the look. The gutter and the two ten-pixel seams were 40px
of a narrow window spent on air.

## Interface notes worth knowing

- **The sign-in page does not scroll.** It carries no wordmark and no tagline —
  the card says what it is — and the botanical plates are clipped to
  `.login-garden` rather than to `.login-shell`: a stem hanging below the fold
  made the door scrollable, and what was under it was the wallpaper of an app
  nobody has signed into yet. The shell itself must stay unclipped vertically,
  because on a short window the sign-up card is taller than the viewport.
- **No nested `backdrop-filter`.** A toolbar inside a pane that is already
  translucent and already blurred takes neither again: the second coat darkens
  the strip, and the second filter is a full compositing pass per frame for
  output the eye cannot tell from one.
- **`filter: blur(0)` is not free.** It still promotes the element and still
  runs a pass. The wallpaper layer declares `filter: none` at blur 0.
- **Shadows are contact, not atmosphere.** `--shadow-soft` is a hairline plus a
  negatively spread pass, so it stays under the card. A wide even blur reads as
  soot ringing a card once there is a wallpaper behind it.
- Every settings row is one shape: a 34 px lead glyph, a name with a line of
  explanation, a control flush right. The profile picture is a row like any
  other, so the labels share a left edge and the values share a right one.
  Settings is a rail and one column of cards; the standing summary column that
  used to sit opposite is gone, because everything it said the form said too.
- **A capped measure in a wider column has to be centred in it.** Otherwise the
  cap that stops a label and its control drifting apart just moves the
  imbalance to the other side — which is what a 64 rem Settings panel with a
  218 px rail produced: the form on the left and a hand of nothing on the right.
- **A `1fr` grid track is floored at its content's min-content width.** Use
  `minmax(0, 1fr)`. The phone's Settings column ran off the side of the panel
  and took every control with it for exactly this reason.
- **Printing is the PDF export.** Every browser prints to PDF, so the whole of
  it is one `@media print` block deciding what is _not_ the note — and giving
  the scroll box back its height and overflow, or the printer is handed one
  screenful and told the rest is off-page.
- **The toolbar does not magnify, and that was a decision rather than a gap.**
  The two pills were a dock: the icon under the pointer grew, its neighbours
  grew less, the rest stepped aside. It is gone at the reader's request, and
  what it took with it is worth knowing before anybody puts it back. A menu
  opened from a docked button is a _descendant_ of the row, so walking down
  into it never fires `pointerleave` and the row went on magnifying to a
  pointer two hundred pixels below it. Nothing that tracks a pointer may carry
  a transition on `transform`, or the icons chase a target they never reach and
  it reads as latency. And the row could not be measured with
  `getBoundingClientRect`, because that reports the box after the transforms
  the dock itself had written — `de5f344` has the numbers.
- **Two `Suggestion` plugins in one editor need two `pluginKey`s.** Every
  instance defaults to `suggestion$`, and ProseMirror refuses two plugins that
  share a key — so adding `[[` beside `/` threw on every note until the second
  one was named.
- **The plate at the end of a note draws once a visit, not once a note.** It was
  removed from there before because it restaged on every note switch, and a
  thing that moves each time you change page is a thing you end up watching
  instead of reading. A module-level flag is the whole of what makes putting it
  back safe.
- **No explanatory paragraphs under controls.** Not in a menu, not in a
  settings section, not under a card. A control that needs a sentence beneath
  it saying what it does is a control named wrongly — rename it, or accept that
  the reader will find out by pressing it, which they will. This was a standing
  habit and it is banned: `.menu-note` is gone from the stylesheet so there is
  nothing to reach for. What may stay is a **status** or **error** line, which
  is the interface answering rather than lecturing, and the one line of a
  settings row's own anatomy, which names the row rather than explaining it —
  and which is where the reason a disabled control is disabled belongs.
- A shortcut nobody is told about is a shortcut nobody has. `⌘K`, `?` and Focus
  mode are all named in the ⋯ menus that already open, and `packages/core/src/lib/shortcuts.ts`
  is the single list both the `?` sheet and the Settings section read.
