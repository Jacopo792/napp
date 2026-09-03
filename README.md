# note-sharing-app

A private notes app built around one shared archive.

![App preview](docs/app-preview-v3.png)

## Why I built it

I wanted the simplicity of a normal notes app without the usual wall of features.
Most note-taking tools eventually turn into project-management suites; I just wanted
a calm place to write, with a few genuinely useful things to do together with the
person sharing the archive.

The result is deliberately simple when you are writing and collaborative where it
matters. Each archive holds two people by default: friends, partners, siblings or any
other pair who want a shared place for their notes. It is not meant to be a workspace
for teams, and the limit is enforced in the database rather than by the interface.

## What we can do together

- Write in the same note in real time, with live cursors and optional presence.
- Comment on specific parts of a note and keep replies in one thread.
- Switch between **My notes** and the other person's notes while staying in the same
  archive.
- Organise notes with nested folders, pins, search, Archive and Trash.
- Add covers, images, links, tables, checklists, PDFs and other attachments.
- Import and export Markdown, or bring the text of a PDF into a note.
- Use local translation and proofreading tools without sending the text to an AI
  service.

The editor is made for long notes as well as quick ones. It uses Tiptap for rich text
and Yjs/Hocuspocus for live editing. Supabase handles accounts, the shared database and
private files.

## Get the app

It runs in a browser at <https://jacopo792.github.io/note-sharing-app/>. Nothing
to install, and it is always the current version.

There is also a Mac app. It is the same application in a window of its own, not
a wrapper around the website, and a note you already have open keeps working
without a connection.

**[Download it for macOS, Apple Silicon](https://github.com/Jacopo792/note-sharing-app/releases/latest)**

The first time you open it, macOS will say the app is damaged. It is not. That
is what macOS says about anything that has not been signed with a paid Apple
Developer ID, and this build is not signed. Control-click the app in
Applications, choose Open, then Open again. macOS remembers the choice and it
opens normally after that.

What the window has that a browser tab cannot:

- A real menu bar, carrying the shortcuts you already use.
- Traffic lights, a title that names the note you are reading, and a window that
  reopens where you left it.
- The number of unread remarks on the Dock icon.
- Emoji & Symbols, smart quotes and text replacement, the way any Mac app has
  them.

Windows gets an installer from the same release. Intel Macs are not built yet.
[`DESKTOP.md`](DESKTOP.md) covers the rest: what it keeps on your machine, what
to check when something does not work, and how a release is made.

## Make it yours

![Appearance settings](docs/customisation-preview-v2.png)

The app is highly customisable, and each person can set it up independently. You can
start from a ready-made palette or choose the accent, background and text colours
yourself; switch between light, dark and system themes; adjust contrast and sidebar
transparency; or use your own wallpaper with separate dim, blur and fit controls.

Reading has its own presets and controls for text size, line width, font weight and
line spacing. Profiles, avatars, note pictures, covers and live-caret colours add the
last personal touches. Most interface and reading settings stay on your device, so the
other person does not have to use the same setup.

## Accounts and shared archives

Each person signs in with a separate account. Membership in `archive_members` is the
access boundary: being a Supabase user by itself does not grant access to somebody
else's archive.

New users receive a personal archive on first sign-in. To share an existing archive, a
member creates a one-time invitation from **Settings → Members**. Invitations expire
after seven days and can only be claimed by the invited address.

A member reads and writes the whole archive; there is no lesser kind, and the interface
asks for no role when it invites somebody. `owner_id` only decides where a note appears
in the interface; it is not a security boundary.

What one member can take back from another is a note, or a passage of one. **Only I may
write this** in a note's ⋯ menu sets `notes.locked_by`, and `notes_editor_update`
refuses the row to everybody else – the lock, the trash stamp and the words alike. A
passage locked from the selection toolbar is held by the collaboration server instead,
which is the only place that can hold it: the mark lives inside a document both members
are entitled to write, and anything written under somebody else's lock is put back
before it reaches them.

The seat limit is a database rule. `archives.seat_limit` defaults to `2` (`1`–`8`
allowed) and a `before insert` trigger on `archive_members`,
`private.enforce_archive_seats()`, refuses the extra row whichever path it arrives by:
bootstrap, invitation redemption or a direct write. Issuing an invitation counts
unclaimed, unexpired invitations against the same limit, so a link that could never be
redeemed is never created. Settings does the same arithmetic to close the form early;
that part is a courtesy, not the boundary.

## Running it locally

Everything below is for working on the app rather than using it.

```bash
cp .env.example .env.local
pnpm install
pnpm dev            # in a browser
pnpm dev:desktop    # in its own window
```

`.env.local` needs these public browser values:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_COLLAB_URL=ws://127.0.0.1:8080
# Only the desktop build needs this one: where an invitation link has to point,
# since the link is opened on a machine that may not have the app.
VITE_WEB_ORIGIN=https://jacopo792.github.io/note-sharing-app/
```

Run the collaboration server separately:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @notes-app/collab-server start
```

`SUPABASE_SERVICE_ROLE_KEY` belongs only on the server. Access to an archive is checked
against the signed-in user's membership.

### Preview without Supabase

```bash
pnpm preview:ui
```

This starts the full interface with in-memory demo data at
<http://localhost:5199>. You can sign in with any credentials.

## Checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:server
VITE_BASE_PATH=/note-sharing-app/ pnpm build
```

## How it is built

- **Frontend:** React 19, TanStack Router, Vite and Tailwind CSS.
- **Editor:** Tiptap with Yjs documents for the title and body.
- **Collaboration:** Hocuspocus over WebSocket, with Redis/Valkey when more than one
  server instance is running.
- **Backend:** Supabase Auth, Postgres, Row Level Security, Realtime and private
  Storage.
- **Offline support:** IndexedDB keeps an already authorised open document usable
  during a disconnect and syncs it after reconnecting.

The repository is a pnpm workspace of two packages and two shells:

- `packages/core/` is the application. Both shells mount it and neither may
  fork it – `eslint.config.js` forbids the core from importing a shell, and
  `packages/core/src/platform.ts` is the six-member interface each shell
  answers instead.
- `apps/web/` is the browser build, published to GitHub Pages.
- `apps/desktop/` is the Electron window: `pnpm build:desktop` writes a macOS
  `.dmg` and a Windows `.exe` into `apps/desktop/release/`, and
  `.github/workflows/release.yml` builds both on a tag. See
  [Get it for your Mac](#get-it-for-your-mac). The renderer is served from
  `app://notes` rather than `file://`, because the collaboration server refuses
  a socket whose origin it does not know and a `file://` page sends none.

The main areas of the repository are:

- `packages/core/src/screens/Notes.tsx` for workspace and note metadata state.
- `packages/core/src/components/` for the sidebar, note list and workspace menus.
- `packages/core/src/features/editor/` for the editor, comments, imports, attachments and language
  tools.
- `packages/core/src/lib/` for sessions, Supabase access, presence, appearance and collaboration.
- `packages/collab-server/` for the Hocuspocus service, persistence and health checks.
- `supabase/migrations/` for the database schema and policies.

Notes are stored as Tiptap JSON with a plain-text projection for search and previews.
Markdown is supported as an import/export format, not as the editor's internal format.

## Deployment

The app runs at <https://jacopo792.github.io/note-sharing-app/>. There is no other
deployment.

The frontend is published through GitHub Pages after the frontend checks, local
Supabase integration tests, Redis tests and server image build pass. It needs the
repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
`VITE_COLLAB_URL`.

Desktop installers are built on a tag, from a matrix of macOS and Windows
runners, because electron-builder cannot cross-compile them. Bump the version in
`apps/desktop/package.json` to match, then:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow publishes both installers to the repository's Releases.

The collaboration server runs separately on Render with Valkey. `render.yaml`
documents that service. Database migrations must be applied before deploying a client
that reads new columns, while destructive schema changes must wait until old clients
no longer depend on them.

## Documentation

| File                           | Contents                                          |
| ------------------------------ | ------------------------------------------------- |
| [`PRODUCT.md`](PRODUCT.md)     | Product scope and behaviour                       |
| [`DESKTOP.md`](DESKTOP.md)     | The downloadable app: install and troubleshooting |
| [`DESIGN.md`](DESIGN.md)       | Interface rules and design decisions              |
| [`CLAUDE.md`](CLAUDE.md)       | Repository, deployment and migration notes        |
| [`SECURITY.md`](SECURITY.md)   | Security model and vulnerability reporting        |
| [`CHANGELOG.md`](CHANGELOG.md) | User-visible and security-relevant changes        |

## Licence

This project is licensed under the GNU General Public License, version 3 or later. See
[`LICENSE`](LICENSE).
