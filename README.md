# note-sharing-app

A private notes application for a small group of people who share one archive.
Everyone signs in with their own account, everyone reads and writes the same
notes, and each person's material keeps its own scope so the shared archive
still reads as separate desks rather than one pile.

It is a static React single-page application with Supabase behind it. There is
no server of our own: Supabase Auth is the identity, Postgres row-level security
is the access boundary, Realtime carries other people's edits, and private
Storage holds pictures and attachments under the same membership rule.

Written for long-form study material — multi-section notes, long titles, Italian
— rather than for quick capture, and tuned first for a wide desktop window with
a separate composition for the phone.

## What is in it

- Markdown notes with a CodeMirror editor: headings, lists, checklists, tables,
  highlights, links, images, PDF attachments and PDF text import.
- Folders that nest, a trash that restores, pinning, and search over the whole
  archive.
- A scope switch built from the archive's roster: your notes, and each other
  member's, by nickname.
- Realtime sync between members, with last-write-wins on a conflict.
- Themes, wallpapers, an accent colour, and four reading axes — size, measure,
  weight and leading.
- Translation of a selection, in place.
- Right-click menus on notes, folders and the note page.

## Running it

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

`.env.local` needs two values, both of which are meant to reach the browser:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Nothing else belongs in the client. There is no service-role key, no archive
passphrase and no shared secret in the bundle: an account plus a row in
`archive_members` is the whole of the access control.

### Without a Supabase project

You do not need an archive of your own to work on the interface:

```bash
pnpm preview:ui
```

This runs the entire application against an in-memory fixture on
<http://localhost:5199>, with the three modules that talk to Supabase swapped
for stand-ins in `preview/`. Sign in with anything. It is the fastest way to see
a change, and it is what the layout work in this repository is verified against.

### Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

All four run on every pull request.

## How it fits together

The browser holds the whole application. `src/routes/notes.tsx` owns the
workspace state and the save pipeline; `src/components/` holds the three columns
— sidebar, note list, editor — and the menus; `src/lib/` holds everything with
no markup in it: the Supabase client, the draft store, the sync layer, Markdown
and attachment helpers, PDF extraction, appearance and reading axes.

Persistence is deliberately plain. Notes, folder names and tag names are
ordinary Postgres columns; files are ordinary Storage objects. Every table
carries one policy shape — you may touch a row if you hold a membership row for
its archive — and `owner_id` names which member's scope a row sits in without
ever being consulted by a policy. Saving is debounced and its state is always
visible: `Unsaved`, `Saving`, `Saved` with the time, `Updated elsewhere` when
somebody else's write arrives, `Save failed` with the error and a retry.

Schema lives in `supabase/migrations/`, applied with the Supabase CLI. Read
`CLAUDE.md` before writing another one — it records the two ways this project's
migrations have gone wrong before.

## Joining an archive

Creating a Supabase account does not join anything. Until an `archive_members`
row exists the application says so plainly and the database returns nothing.

- To connect an existing account to an existing archive: `pnpm add:member`. It
  signs in as a member who is already there and writes the missing row — no
  service-role key involved.
- To give somebody an archive of their own:
  `supabase/admin/new-archive-for-person.sql`, run in the Supabase SQL editor.

Membership is full read and write over every note in the archive. Somebody who
should use the application without reading your notes needs their own archive,
not a membership. Roles that can read without writing are not built yet.

## Documentation

| File | What it settles |
| --- | --- |
| `PRODUCT.md` | Who it is for, what it is for, and the operating context |
| `DESIGN.md` | The interface rules, and the reasoning behind them |
| `CLAUDE.md` | Repository layout, deployment, and the migration hazards |
| `SECURITY.md` | How to report a vulnerability privately and the security model |
| `CHANGELOG.md` | User-visible and security-relevant changes by release date |

## Deployment

Pushing to `main` builds and publishes to GitHub Pages. The workflow reads
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from repository
variables. Nothing secret is involved, because the client holds nothing secret.

## Licence

GNU General Public License, version 3 or later. The full text is in
[`LICENSE`](LICENSE).

In short: use it, study it, change it, share it. If you distribute a modified
version — as source or as a build — that version has to be free software under
the same licence, and you have to make its source available to whoever you gave
it to.

One thing worth knowing rather than discovering: the GPL is triggered by
*distribution*. Running a modified copy of this application on your own server
and letting other people use it in their browser is not distribution, so it does
not oblige you to publish those changes. The licence that closes that gap is the
AGPL, and this project is not under it.
