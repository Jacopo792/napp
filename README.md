# note-sharing-app

A private notes application for a small group of people who share one archive.
Everyone signs in with their own account, every member can read every note, and
editors can write the same notes, while each person's material keeps its own
scope so the shared archive still reads as separate desks rather than one pile.

It is a static React single-page application with Supabase behind it. There is
no server of our own: Supabase Auth is the identity, Postgres row-level security
is the access boundary, Realtime carries other people's edits, private Storage
holds pictures and attachments under the same membership rule, and Presence is
opt-in and visible only while you share your own.

Written for long-form study material — multi-section notes, long titles, Italian
— rather than for quick capture, and tuned first for a wide desktop window with
a separate composition for the phone.

## What is in it

- Markdown notes with a CodeMirror editor: headings, lists, checklists, tables,
  highlights, links, images, PDF attachments and PDF text import.
- Folders that nest, a trash that restores, pinning, and search over the whole
  archive.
- A scope switch built from the archive's roster: your notes, and each other
  member's, by nickname. The archive stays readable even if it holds many
  members, and each account opens on its own scope.
- Realtime sync between members, with last-write-wins on a conflict.
- Invitations that never turn an email into a directory: a one-time link whose
  raw token is shown once, whose SHA-256 digest is stored, that expires in seven
  days and can only be claimed by an account whose confirmed Auth email matches.
- Roles: every member can read every note and list; only editors can write
  notes, folders, tags and private files, change the archive name, invite others
  or change another member's role. The last editor cannot be demoted.
- Accounts, personal archives and a chooser: sign up, confirm your address, and
  the first archive is created for you atomically; an account that belongs to
  several archives picks which one to open.
- Avatars for every member: a nickname and an optional picture stored under the
  account's own id, readable by anyone you share an archive with, writable only
  by you, cached as object URLs and updated over Realtime.
- Live presence that is a mutual choice: off by default, the client joins the
  presence channel only while broadcasting its own, so there is no listen-only
  mode, and the server allows presence only to members of that archive on a
  private Realtime channel.
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
workspace state and the save pipeline; `src/components/` holds the sidebar, note
list and menus; `src/features/editor/` holds the editor domain — `components/`
for `EditorToolbar`, `MarkdownEditor`, `NoteEditor` and `TitleField`, and `lib/`
for `draft`, `attachments`, `pdf` and `translation`; `src/lib/` holds the rest
with no markup in it: the Supabase client, session and archive bootstrap,
invite and role helpers, sync and private presence, avatar cache, appearance and
reading axes.

Persistence is deliberately plain. Notes, folder names and tag names are
ordinary Postgres columns; files are ordinary Storage objects. Every archive row
is readable by any member of its archive; only editors may change notes,
folders, tags, archive settings and `note-images` objects — the role is enforced
by `private.can_write_archive(archive_id)` and by direct writes to
`archive_members` being revoked entirely. `owner_id` names which member's scope
a row sits in without ever being consulted by a policy. A profile and an avatar
are personal: `private.shares_archive(user_id)` lets you read a peer's row, and
only the account itself may write its own. Saving is debounced and its state is
always visible: `Unsaved`, `Saving`, `Saved` with the time, `Updated elsewhere`
when somebody else's write arrives, `Save failed` with the error and a retry.

Schema lives in `supabase/migrations/`, applied with the Supabase CLI. Read
`CLAUDE.md` before writing another one — it records the two ways this project's
migrations have gone wrong before, and why the `20260829250000` presence
migration touches only `realtime.messages` for `extension = 'presence'`.

## Joining an archive

Creating a Supabase account does not join anything. Until an `archive_members`
row exists the application says so plainly and the database returns nothing.
Signing up creates a personal archive atomically the first time you sign in: a
private security-definer function inserts both the `archives` row and your
membership in one transaction behind `ensure_personal_archive()`, held by an
advisory lock so two tabs do not create two archives. If an account belongs to
several archives, sign-in shows a chooser instead of the old
exactly-one-membership error.

- To invite someone who already has an account: create an invitation in Settings
  (or `pnpm add:member` for a local administrative path that signs in as an
  existing member and writes the missing row — no service-role key involved).
  The invitation is a 64-hex-character one-time link. Postgres keeps only its
  SHA-256 digest, the link expires in seven days, the same address can be
  re-invited without creating a duplicate, and the redemption checks that the
  caller's `auth.users.email_confirmed_at` is set and lower-cased equals the
  invited address. The browser never resolves an address to a user id.
- To give somebody an archive of their own:
  `supabase/admin/new-archive-for-person.sql`, run in the Supabase SQL editor.

Every member can read every note in the archive; only editors can write notes,
folders, tags, archive settings, files and invitations, or change another
member's role. A viewer sees the same rows and the same scopes but the editor,
menus and write paths are inert. Somebody who should use the application without
reading your notes needs their own archive, not a membership.

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
