# Repository guide

## Architecture

- React 19 + Vite, a static SPA deployed to GitHub Pages. There is no server of
  ours.
- Supabase is the whole backend: Auth, Postgres, Realtime, private Storage.
- The browser gets two values, `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. Nothing else.

Access control is Supabase Auth plus one table. A row in `archive_members` lets
you read the archive; a row with `role = 'editor'` lets you write it, enforced
by `private.can_write_archive()` and by direct writes to `archive_members`
being revoked entirely. `owner_id` names which member's scope a row sits in and
is never read by a policy.

Notes, folder names, tag names and files are ordinary columns and Storage
objects. Nothing is encrypted; see _The retired encrypted format_ below.

## Local development

```bash
cp .env.example .env.local
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm preview:ui` runs the whole interface against an in-memory fixture on
`localhost:5199`, with `@/lib/supabase`, `session`, `sync` and `presence`
swapped for the stand-ins in `preview/`. No credentials, no network. Sign in
with anything. Change a mock whenever you change the real module's shape —
`preview/supabase.mock.ts` must return a **fresh** roster array from
`loadArchive`, because handing back the same object makes every roster change
invisible to React.

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
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from repository
variables. No service-role key, account password or archive passphrase belongs
anywhere near the build.

**Deploy before you drop.** A static SPA has no server to deploy in step with
the database, so the oldest client still running is whatever `main` last built,
plus anybody holding an open tab. When four `ciphertext` columns were dropped
ahead of the client that had stopped selecting them, every query the live build
made failed and the archive looked empty. The columns had to be re-added, empty,
within the hour. Merge and deploy the client that no longer asks for a column,
confirm it, and only then drop it.

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
`claim_archive_invite(token)` adds the membership only when the caller's
confirmed Auth email matches the invited address. The browser never resolves an
address to a user id.

The interface offers the finished invitation two ways, and neither passes the
token through anything of ours: copied by hand, or handed to a `mailto:` that
the member's own mail app composes and sends. Sending it server-side would need
a server we do not have, and would put the token somewhere it currently never
goes.

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

The document is the unit of the write, so a note saved by two people at once is
the one place text can be lost. It was being lost. `saveNote` wrote
conditionally on `version` and then, when the condition matched nothing —
exactly the signal that somebody else had written — re-read the current version
and rewrote the same payload on top of it, four times over. Silent, total, no
error anywhere.

The rule now:

- A conditional update that matches nothing is a **conflict**, never a reason to
  write anyway. `NoteConflict` carries the row that is actually there, so the
  merge costs no extra round trip.
- `mergeDocuments()` in `src/features/editor/lib/merge.ts` is a three-way merge
  over the document's **top-level blocks**. It does not merge prose, and it
  never writes a marker into the text. Blocks are compared by identity — the
  same JSON is the same block — and the changed window on each side is found by
  trimming the common prefix and suffix rather than by an LCS, which is exact
  for edits that sit in one place.
- Overlapping windows are resolved when what **both sides replaced was blank** —
  an empty paragraph or heading. A new note is exactly one empty paragraph, so
  two people opening one to talk both type into the same block; that is two
  people writing, not a conflict, and both texts are kept in order. Anything
  holding content — words, an image, a table — is real, and two sides rewriting
  the same real block returns `null`.
- On `null` the remote version stays in the note and the local one becomes a
  note of its own, `"<title> — your version"`. Nothing is discarded either way,
  and the readout says which happened.
- The merge needs three documents, so `draft.ts` keeps the `base` each draft
  departed from. **The base must always be a document the archive actually
  holds** — set it to what is on screen and the next merge reads the other
  person's blocks as a deletion. `reconcileDraft()` is the one that sets both
  together, for keystrokes made while a merged write was in flight.

`applySnapshot` still withholds remote content from a note you are typing in,
and that is fine now: the merge on the next save (250 ms after you pause) is
what delivers it. Do not make it apply remote content to a dirty draft — that
is the overwrite this whole section exists to prevent.

## Members and profiles

`public.profiles` carries a nickname and an avatar object per account.
`private.shares_archive()` lets you read the profile of someone you share an
archive with; only the account itself may write its own row. Avatars live in
their own private bucket under the owner's user id.
`src/lib/avatarCache.ts` keeps one object URL per avatar, and Realtime keeps the
roster live.

A picture is placed before it is uploaded, not cut from the middle of the file.
`AvatarCropper` shows a round window over the image, draggable and zoomable;
`avatarCropRect()` in `src/lib/image.ts` turns what the window shows into the
square `prepareAvatar()` cuts. Preview and output take the same three numbers,
so they cannot disagree. The math has tests in `src/lib/image.test.ts`.

## Presence

Off by default and mutual: the client joins `presence:<archiveId>` with
`config.private = true` only while broadcasting its own `{ userId, onlineAt }`,
so there is no listen-only mode.
`20260829250000_private_archive_presence.sql` restricts `realtime.messages` for
`extension = 'presence'` to members of the archive derived from
`realtime.topic()` via `private.presence_archive_id()` — `SELECT` to receive,
`INSERT` to publish. Postgres Changes subscriptions stay public channels
filtered by table RLS; `private_only` is not on globally, so they are undisturbed.

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

## The retired encrypted format

The archive was encrypted once and is not any more. Every note, folder, tag and
archive setting is a plaintext column; every Storage object carries its real
content type; no code under `src/` decrypts anything. `crypto.ts` lives in
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

## Interface notes worth knowing

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
