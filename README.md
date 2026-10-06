# Napp

A private place for your notes and your writing, shared with the people you choose.

![App preview](docs/app-preview.png)

## Why I built it

I wanted an ordinary notes app that did not slowly turn into a project-management
tool. Somewhere calm for quick lists and long writing alike, with just enough sharing
for the few people who keep things together: partners, friends, a study group.

## What is in it

- A rich editor for writing, checklists, tables, links, images, PDFs and videos
  (MP4, WebM and MOV up to 100 MB).
- Folders, pins, search, Archive and Trash so notes do not get lost as they pile up.
- Live editing when two people are in the same note, plus comments on a specific
  sentence or paragraph.
- Separate **My notes** and shared views inside one archive, and more than one
  archive per account, switched without signing out.
- A history for every note: who wrote what, words added and removed, named
  versions, and a restore that keeps the present first.
- Sheets for a note, a person and a folder — hold a row still to see everything
  about it in one place.
- Covers, avatars, themes and reading settings that each person can make their own.
- Markdown import and export, PDF text import, and local translation and proofreading
  tools.
- A **Book** archive for long writing — a thesis, a novel: chapters and parts on a
  printable page, footnotes, numbered captions, cross-references, and notes left on
  a passage with a right-click.

It is for keeping notes, not for running a team. The useful collaboration is there
when you need it; the rest stays out of the way while you write.

## Get the app

Use it in the browser at <https://jacopo792.github.io/napp/>: there is
nothing to install and it is always up to date. If you would rather have it in its own
window, there is a desktop app too.

![Sign-in screen](docs/sign-in-preview.png)

**Download:
[Mac, Apple Silicon](https://github.com/Jacopo792/napp/releases/latest/download/Napp-mac-arm64.dmg) ·
[Mac, Intel](https://github.com/Jacopo792/napp/releases/latest/download/Napp-mac-x64.dmg) ·
[Windows](https://github.com/Jacopo792/napp/releases/latest/download/Napp-windows-setup.exe)**

The desktop version is the same app, with its own menu bar, shortcuts and Dock badge for
unread comments. Notes already open keep working if the connection drops.

The first launch needs one extra step, because the app is not signed with an
Apple Developer ID. Open it, let macOS refuse, then go to System Settings →
Privacy & Security and press **Open Anyway**; on macOS 14 and earlier,
Control-click the app in Applications and choose **Open**. Once only.

Intel Macs and Windows have their own file on the same release page.
[`DESKTOP.md`](DESKTOP.md) has installation help and the practical details.

## Make it yours

![Appearance settings](docs/appearance-settings-preview.png)

Start with a ready-made palette or choose your own colours, theme and wallpaper. You
can also change the reading width, text size, line spacing and weight until longer
notes feel right. Your settings follow your account to every browser and to the
desktop app, and stay yours: the person sharing the archive does not have to look at
it the way you do.

## Every version of a note

![Note history](docs/history-preview.png)

A note keeps its own history: who wrote each stretch, how many words came and went,
and the moments you chose to name. Any version can be compared with the present and
restored, and restoring keeps the present as a named version first, so nothing is lost
by trying.

## Everything about a note in one place

![Note sheet](docs/note-sheet-preview.png)

Hold a note's row still, or choose **Note info** from its menu, and its sheet opens:
folder, owner, words, versions, open remarks, who wrote in it and when. A person's face
and a folder open sheets of their own, and every name inside one leads to the next.

## More than one archive

![Archive switch](docs/spaces-preview.png)

One account can belong to several archives — your notes with a partner, a study group,
a thesis — and move between them without signing out. Each archive keeps its own
members, folders and list order, and a new archive starts with everyone you already
share one with. Make new ones and turn on the switch at the top of
the sidebar from **Settings → Archives**.

## Accounts and shared archives

Everyone has their own account. On first sign-in, you get a private archive; to share
one, send an invitation from **Settings → Members**. An archive holds up to
eight people, and invitations expire after seven days.

Every member can read and edit the shared archive. If a note needs to stay yours, you
can lock the whole thing or just a passage. Accounts outside the archive cannot see its
notes or files.

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
VITE_WEB_ORIGIN=https://jacopo792.github.io/napp/
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
VITE_BASE_PATH=/napp/ pnpm build
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
  [the desktop guide](DESKTOP.md). The renderer is served from
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

The app runs at <https://jacopo792.github.io/napp/>. There is no other
deployment.

The frontend is published through GitHub Pages after the frontend checks, local
Supabase integration tests, Redis tests and server image build pass. It needs the
repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
`VITE_COLLAB_URL`.

Desktop installers are built on a tag, from a matrix of macOS and Windows
runners, because electron-builder cannot cross-compile them. Every push to `main` is a release: bump
the version in `apps/web` and `apps/desktop`'s `package.json`, add its entry to
`RELEASES` in `packages/core/src/lib/whatsNew.ts` (the test fails otherwise), then:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
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
