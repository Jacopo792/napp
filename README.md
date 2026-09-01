# note-sharing-app

A private notes application for two people who share one archive. Each signs in
with their own account, both read every note, and each person's material keeps
its own scope so the archive reads as two desks rather than one pile.

It is a React single-page application backed by Supabase and a small
Hocuspocus collaboration service. Supabase Auth is the identity, Postgres
row-level security is the access boundary, Yjs carries simultaneous edits,
private Storage holds pictures and attachments, and Presence is opt-in.

Written for long-form study material — multi-section notes, long titles, Italian
— rather than quick capture, and tuned first for a wide desktop window, with a
separate composition for the phone.

## What is in it

- **Rich-text notes** in a Tiptap editor: headings, lists, checklists, tables,
  colours, links, images, PDF attachments and PDF text import. Existing Markdown
  is converted losslessly on first open and kept in `legacy_body`.
- **Writing controls at the caret:** `/` opens filtered block and colour commands,
  selected text gets a compact formatting bar, and desktop blocks can be reordered
  with a drag handle. Italian smart punctuation is enabled without changing the
  stored document format.
- **Folders** that nest, a trash that restores, an archive that does not, pinning,
  and search over the whole archive. An archived note is filed off the folder list
  and stays editable — the trash is the waiting room, the archive is the shelf —
  and you can set your archived notes to be yours alone, enforced by a row-level
  policy rather than by a filtered list.
- **A scope switch** built from the roster: your notes, and the other member's,
  by nickname. Each account opens on its own scope.
- **Simultaneous editing with Yjs.** Title and body are one shared document,
  Hocuspocus authenticates every connection through Supabase, Redis/Valkey
  links overlapping server instances, and IndexedDB keeps an authorised open
  document usable through a disconnect. The toolbar says Connecting, Live or
  Offline; optional presence adds collaborative carets.
- **A picture per note.** A note carries a photograph of its own, chosen from
  its row's context menu and cut in the same round cropper the profile picture
  uses; it stands wherever the note is named. A note may also carry a curated
  or privately uploaded cover, which can be replaced, removed and repositioned
  vertically. Neither rewrites the note document.
- **Two seats, enforced by the database.** `archives.seat_limit` defaults to 2, a
  trigger on `archive_members` refuses the row past it, and issuing an invitation
  counts the seats unclaimed invitations already hold. The column takes 1–8, so a
  larger group is a value change rather than a rewrite.
- **Invitations** that never turn an address into a directory: a one-time link
  whose raw token is shown once, whose SHA-256 digest is stored, that expires in
  seven days and is claimable only by an account using the invited address. Copy
  it, or hand it to your own mail app — it never passes through anything of
  ours. An unclaimed one can be withdrawn to free its seat.
- **Roles.** Both members read everything; only editors write notes, folders,
  tags and files, rename the archive, invite, or change a role. The last editor
  cannot be demoted.
- **Leaving a shared archive.** Settings → Members lets a member remove only
  themselves after confirmation. The last member and last editor cannot leave;
  once a member leaves, their seat is available to the remaining editor’s
  invitation flow and the archive’s notes stay in place.
- **Accounts.** Sign in and create-account are separate modes with their own
  copy, both with a show/hide password control. The first archive is created for
  you atomically on first sign-in. An account in several archives picks one at
  sign-in. Email confirmation is off — Supabase's built-in mail service only
  delivers to the project's own team addresses, so it blocked signup rather than
  protecting it. `SECURITY.md` records what that costs an invitation.
- **Profiles.** A nickname and an optional picture, stored under the account's
  own id, readable by whoever shares your archive and writable only by you. The
  picture is placed in a round window — dragged and zoomed — before it is
  uploaded, rather than cut from the middle of the file.
- **Live presence**, off by default and mutual: the client joins the channel only
  while broadcasting its own, and the server allows presence only to members of
  that archive on a private Realtime channel. What it carries is the note you
  have open and whether you are typing, so the other member appears in that
  note's header with their picture, their nickname and a caret while they
  write.
- **Markdown in and out.** Copy a note as Markdown, export one as a `.md` file,
  or export the whole list — a folder of files where the browser can write one,
  one combined file where it cannot. `.md` files import back. That is the
  interoperability: Obsidian is a folder of Markdown, Notion and Google Docs
  read pasted Markdown, and Apple Notes has no API. Pictures leave as a
  reference, not as bytes.
- **Language tools that run on this device.** Translation of a selection in
  place, and a proofreader that fixes spelling and grammar and says how many
  corrections it made — nothing to fix writes nothing at all. Common,
  unambiguous English contractions are also fixed as the word is completed;
  after two automatic corrections of one spelling, the writer's third use is
  left alone. Everything stays in the browser: no API key, token store or
  remote request. The manual proofreader can be switched off in Settings, and then
  its row is absent rather than greyed. These language tools use no remote
  application service.
- Themes, wallpapers, an accent colour, four reading axes (size, measure, weight,
  leading), and right-click menus on notes, folders and the note page.

## Running it

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

`.env.local` needs three public values meant to reach the browser:

```
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_COLLAB_URL=ws://127.0.0.1:8080
```

The collaboration service is a separate workspace package:

```bash
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @notes-app/collab-server start
```

`SUPABASE_SERVICE_ROLE_KEY` belongs only to that server. It persists Yjs binary
documents but never decides access; authorization is performed with the
caller's Supabase token and the existing `archive_members` RLS boundary.

### Without a Supabase project

```bash
pnpm preview:ui
```

Runs the entire application against an in-memory fixture on
<http://localhost:5199>, with the modules that talk to Supabase swapped for
stand-ins in `preview/`. Sign in with anything. It is the fastest way to see a
change, and it is what the layout work here is verified against.

### Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:server
pnpm build
```

All four run on every pull request.

## How it fits together

`src/routes/notes.tsx` owns workspace and metadata state.
`src/components/` holds the sidebar, note list, menus and the avatar cropper.
`src/features/editor/` holds the editor domain — `components/` for
`EditorToolbar`, `RichTextEditor`, `NoteEditor` and `TitleField`, `lib/` for
`content`, `ydoc`, `exchange`, `attachments`, `pdf`, `translation` and
`proofread`. `src/lib/` holds the
rest with no markup in it: the Supabase client, session and archive bootstrap,
invite and role helpers, sync, private presence, avatar cache, image
processing, appearance, reading axes and the collaboration provider. `server/`
holds the Hocuspocus service, continuous authorization, persistence and health
probes.

Persistence is deliberately plain. Note documents are versioned JSONB with a
plain-text body for search and previews; folder and tag names are ordinary
columns; files are ordinary Storage objects. Any member may read any row in
their archive; only editors may change `notes`, `folders`, `tags`,
`note_tags`, `archives` and `note-images`, enforced by
`private.can_write_archive()` and by direct writes to `archive_members` being
revoked. `owner_id` names which member's scope a row sits in, and one policy
consults it: `private.archived_note_visible()` withholds an archived note from
the other members when its owner has set `profiles.hide_archived`. Everywhere
else it is organisational. Profiles and avatars are personal:
`private.shares_archive()` lets you read a peer's, and only the account itself
may write its own.

Schema lives in `supabase/migrations/`, applied with the Supabase CLI. Read
`CLAUDE.md` before writing another one — it records how this project's
migrations have gone wrong before, including the starter-scaffold trigger that
silently broke every signup.

## Joining an archive

Creating a Supabase account joins nothing. Until an `archive_members` row
exists, the application says so and the database returns nothing. Signing up
creates a personal archive atomically on first sign-in, behind
`ensure_personal_archive()` and an advisory lock so two tabs cannot make two.

- **To invite the other person:** create an invitation in Settings → Members, or
  use `pnpm add:member` locally (it signs in as an existing member — no
  service-role key). The link is one-time, expires in seven days, and can only be
  claimed by an account using the address it was issued to. The same address can
  be re-invited without creating a duplicate.
- **To give somebody an archive of their own:**
  `supabase/admin/new-archive-for-person.sql`, run in the Supabase SQL editor.

Somebody who should use the application without reading your notes needs their
own archive, not a membership.

## Documentation

| File           | What it settles                                                 |
| -------------- | --------------------------------------------------------------- |
| `PRODUCT.md`   | Who it is for, what it is for, and the operating context        |
| `DESIGN.md`    | The interface rules, and the reasoning behind them              |
| `CLAUDE.md`    | Repository layout, deployment, and the migration hazards        |
| `SECURITY.md`  | How to report a vulnerability privately, and the security model |
| `CHANGELOG.md` | User-visible and security-relevant changes by date              |

## Deployment

Pushing to `main` publishes only after frontend checks, the real local Supabase
integration suite, multi-instance Redis tests and the server image build pass.
The Pages build reads `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and
`VITE_COLLAB_URL`, all three GitHub repository variables. A missing one throws
in `vite.config.ts`, which fails the deploy job after the checks have passed and
leaves the previous build serving — so read the run, not the site.

The collaboration service is deployed separately, as `notes-collab` on Render
with a Valkey instance beside it. `render.yaml` describes it but does not drive
it: the live service was created through the Render API, because the image needs
the repository root as its build context and the blueprint was never connected.

The database must stay compatible with the last deployed client: an old build in
an open tab still queries the columns it was built against. Deploy the client
that has stopped asking for a column before dropping it.

It runs the other way too, and the window is narrower. A client that selects a
column the database does not have yet fails the whole query, not that field —
the archive looks empty. So `supabase db push --linked` goes **before** the push
to `main` that adds the column to a select list, never after.

## Licence

GNU General Public License, version 3 or later. The full text is in
[`LICENSE`](LICENSE).

In short: use it, study it, change it, share it. If you distribute a modified
version — as source or as a build — that version has to be free software under
the same licence, and you have to make its source available to whoever you gave
it to.

One thing worth knowing rather than discovering: the GPL is triggered by
_distribution_. Running a modified copy on your own server and letting other
people use it in their browser is not distribution, so it does not oblige you to
publish those changes. The licence that closes that gap is the AGPL, and this
project is not under it.
