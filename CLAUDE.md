# Repository guide

## Architecture

- React 19 + Vite SPA on GitHub Pages, plus a Node 22 Hocuspocus service in
  `server/`.
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

All of that is gone from `src/`. **The Postgres side is untouched**: `tags`,
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
  `excludes: ""` and *is* encoded that way; do not copy it here.
- The editor's `filterTransaction` is a **courtesy**, not the rule, and it must
  let transactions carrying `ySyncPluginKey` through: those are the other member
  writing their own locked passage, and refusing one leaves the editor
  disagreeing with the document it is bound to.

`handleMetaChange` in `notes.tsx` is the one place every per-note metadata
change passes through, so the lock is honoured there once rather than in each
of pinning, filing, trashing and shelving.

Both locks are offered from the ⋯ menu and the row's own right-click, and from
nowhere else. The strip above the note says which state it is in and carries no
button for it: a second control up there was only a second thing to keep
agreeing with that line.

## Remarks, and knowing one is waiting

`REMARKS` is a scope, not a panel, for the same reason Trash is one — the note
list already knows how to draw notes, and a second list would be a second thing
to keep in step. It holds every note carrying a thread nobody has resolved, and
a note leaves it the moment its last thread is dealt with. Opening a note from
there opens its conversation with it.

The badge counts remarks *somebody else* wrote, in an open thread, since this
browser last looked. The line it compares against is a timestamp in
`localStorage`, not a column: it is a fact about a device looking rather than
about the archive, and a set of read ids is a thing nobody ever finishes
pruning. A new device therefore starts with everything unread, which is the
right answer for it.

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
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:server
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
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_COLLAB_URL` from
repository variables. No service-role key, account password or archive
passphrase belongs anywhere near the build.

All three are required — `vite.config.ts` throws on a missing one — and the
throw happens in the `deploy` job, after `checks` and `backend` are already
green. Pages then keeps serving the previous build, so the site looks healthy
while nothing has shipped. `VITE_COLLAB_URL` was missing for the whole life of
the collaboration branch and that is exactly how it read. Check the run, not the
site: `gh run list --branch main --limit 1`.

The collaboration server is `notes-collab` on Render, in Frankfurt, built from
`server/Dockerfile` with the repository root as its build context, with the
Valkey instance `notes-collab-bus` beside it. `render.yaml` describes it and
does not drive it: the live service was created through the Render API, because
the CLI has no flag for a Dockerfile outside the root and the blueprint was
never connected. Editing that file changes nothing by itself. It deploys on
every push to `main`, and on the free plan it sleeps after fifteen idle minutes
and takes about fifty seconds to wake — during which no editor opens, because an
editor opens only after the server has authorized and synced.

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
`src/lib/avatarCache.ts` keeps one object URL per avatar, and Realtime keeps the
roster live.

Who is on the _note_ is a different question, and it is asked of Yjs awareness
(`useCollaborationPeers`), not of the Realtime presence channel: a peer in that
list is connected to this note's document by construction, so there is no
`noteId` filter to get wrong. Realtime presence still carries the `typing` flag
and still feeds the Settings roster.

A picture is placed before it is uploaded, not cut from the middle of the file.
`AvatarCropper` shows a round window over the image, draggable and zoomable;
`avatarCropRect()` in `src/lib/image.ts` turns what the window shows into the
square `prepareAvatar()` cuts. Preview and output take the same three numbers,
so they cannot disagree. The math has tests in `src/lib/image.test.ts`.

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

## Presence

Off by default and mutual: the client joins `presence:<archiveId>` with
`config.private = true` only while broadcasting its own
`{ userId, onlineAt, noteId, typing }`, so there is no listen-only mode.

`noteId` and `typing` are what the note header reads to show who else is on
this page. `typing` is a **flag the writer raises and lowers**, not a
timestamp: a timestamp would need a clock, an expiry and a re-render tick in
every reader to notice it lapse, for something the writer already knows.
`markTyping()` in `notes.tsx` announces once when a burst starts and once
`TYPING_IDLE_MS` after it ends — two packets per burst, not one per keystroke.
Changing note re-announces with `typing: false`, so a raised flag can never be
left behind on a page nobody is on.
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

## Markdown in and out

`src/features/editor/lib/exchange.ts` is the whole of this app's
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
in memory (`linksTo()` in `src/lib/derived.ts`), never by querying a column: a
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

## What the sign-in page is allowed to import

`src/lib/session.ts` is the login screen's entire back end and imports
`./supabaseClient` and `./noteStore` — never `./supabase`. `supabase.ts` reaches
`content.ts` for the note projection, `content.ts` builds the Tiptap schema, and
Rollup then puts all of ProseMirror in the chunk both routes share: the sign-in
form was downloading 224 kB gzipped of rich-text editor before you could type a
password. It is 59 kB now, and the editor moved into the lazy `/notes` chunk
where it belongs.

The in-memory note cache (`noteCache`, `resetArchiveCache`, `adoptArchiveCache`)
lives in `noteStore.ts` for that reason and no other — `session.ts` has to clear
it on sign-out, and that one import was the whole rope. Keep it there.

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
  Settings is a rail and one column of cards; the standing summary column that
  used to sit opposite is gone, because everything it said the form said too.
- **A capped measure in a wider column has to be centred in it.** Otherwise the
  cap that stops a label and its control drifting apart just moves the
  imbalance to the other side — which is what a 64 rem Settings panel with a
  218 px rail produced: the form on the left and a hand of nothing on the right.
- **A `1fr` grid track is floored at its content's min-content width.** Use
  `minmax(0, 1fr)`. The phone's Settings column ran off the side of the panel
  and took every control with it for exactly this reason.
- **Nothing that tracks the pointer may have a transition on `transform`.** The
  toolbar's dock magnification chases a target it never reaches otherwise: the
  icons lag the cursor and rubber-band when it stops, which reads as latency
  rather than as magnification. `EditorToolbar` adds `is-docked` while
  tracking, which takes the transition off, and removes it in the same tick as
  the properties so the settle animates.
- **Two `Suggestion` plugins in one editor need two `pluginKey`s.** Every
  instance defaults to `suggestion$`, and ProseMirror refuses two plugins that
  share a key — so adding `[[` beside `/` threw on every note until the second
  one was named.
- **The plate at the end of a note draws once a visit, not once a note.** It was
  removed from there before because it restaged on every note switch, and a
  thing that moves each time you change page is a thing you end up watching
  instead of reading. A module-level flag is the whole of what makes putting it
  back safe.
- A shortcut nobody is told about is a shortcut nobody has. `⌘K`, `?` and Focus
  mode are all named in the ⋯ menus that already open, and `src/lib/shortcuts.ts`
  is the single list both the `?` sheet and the Settings section read.
