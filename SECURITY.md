# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/Jacopo792/napp/security/advisories/new).
Do not open a public issue for a vulnerability that could expose an archive,
an account, or a Storage object.

Include the affected surface, the steps needed to reproduce the problem, the
access level of the account you used, and the impact you observed. A minimal
proof of concept is useful; real notes, credentials, session tokens, and
personal files are not.

You should receive an acknowledgement within seven days. A fix will be
developed privately when disclosure before deployment would put existing
archives at risk.

## Persistent sign-in

Both shells retain Supabase access and refresh tokens in their origin's local
storage. On startup the SDK restores and, when needed, refreshes them, and
`getUser()` validates the account before the saved archive opens. The archive
selection in `napp:archive-session` is navigation metadata, never authorization;
archive membership and RLS remain the access boundary. A transient auth/network
failure preserves that selection and offers a retry. A missing, rejected, or
mismatched identity discards it. Explicit sign-out clears the archive selection,
the note cache and the local Supabase session. Auto-lock remains opt-in.

## Supported version

Only the current `main` branch and the production build published from it are
supported. Older static builds may remain open in a browser tab, so database
changes must remain compatible with the last deployed client until the new
client has been published and checked.

## Security model

Supabase Auth identifies the account. Postgres row-level security authorizes
database access through `archive_members`, and private Storage applies the same
archive-membership boundary. `owner_id` identifies the author for account erasure and safety filtering;
archive members can otherwise edit shared writing.

There is one exception, and it is enforced in the same place. A note its owner
has archived is withheld from the other members when that owner sets
`profiles.hide_archived`: `notes_member_select` calls
`private.archived_note_visible()`, which reads the flag from the owner's
profile row — the one row only its own account may write. The predicate also
guards the update and delete policies, so a withheld note is not writable by
someone who cannot see it.

What that is worth, exactly: **the other member's client cannot fetch the
row.** It is not encryption. Nothing in this archive is encrypted, so anyone
holding database credentials reads archived notes like any other. Hiding here
is a boundary between members, not between a member and the database.

Preferences, including the per-note record of which conversations an account
has read, are one row per account in `profile_preferences`. Nobody else may read
that table — it is deliberately not a column on `profiles`, whose select policy
has no column list and would therefore have handed a shared archive's other
member your palette, your wallpaper and your lock timeout along with your
nickname.

Membership is capped in the database, not in the interface. A `before insert`
trigger on `archive_members` refuses a row once the archive holds
`archives.seat_limit` members, so every path in — the personal-archive
bootstrap and invitation redemption alike — is covered by one check. Issuing an
invitation additionally counts unclaimed, unexpired invitations, so a link that
could never be redeemed is never created; `revoke_archive_invite()` deletes an
unclaimed row, which destroys the stored digest and invalidates the link
immediately.

Making an archive is also a way in, and it is deliberate. `create_archive`
seats, beside its maker, everyone the maker already shares an archive with (up
to the limit, through the same trigger). Somebody who shares one archive with
you therefore sees every archive you make afterwards; to keep one to yourself,
make it and then have them leave it, or make it from an account that shares
nothing. It never adds anybody to an archive that already exists.

Invitation tokens exist in plaintext only in the browser that created them.
They are shown once, stored as a SHA-256 digest, and delivered by the member
either through the clipboard or through their own mail client — the application
has no mail path, and adding one would put the token on a server it currently
never reaches.

**Email confirmation is off** (2026-08-30). Supabase's built-in mail service
only delivers to the project's own team addresses, so the message never reached
anybody else and no account could be finished; the project is used by its owner
and a couple of friends, and confirmation was removed at their request. The
consequence is stated rather than hidden: an address is no longer proof that
the caller owns that mailbox, so the one-time token is the whole of an
invitation's secret. It is still 64 hex characters, still stored only as a
digest, still single-use, and still expires in seven days — the ordinary
invite-link model, not the stronger one it replaced. Restoring the earlier
guarantee means configuring `[auth.email.smtp]`, setting
`enable_confirmations = true`, and putting the `email_confirmed_at` check back
into `private.redeem_archive_invite()`.

The desktop window is the same application in an Electron shell, and the shell
adds no privilege to it. The renderer runs with `contextIsolation`, `sandbox`
and no Node integration; the preload exposes three file functions — save a
file, show a file, print — plus one cosmetic channel out and two receive-only
channels in: the menu's keystrokes, and whether a newer release exists on
GitHub. The main process validates the colour before it can paint the Windows
title bar, and the two inbound channels add nothing to `window.napp` — they
arrive as DOM events, so the page may listen and has nothing new to call. The
release check runs in the main process rather than the renderer precisely so
that reaching `api.github.com` does not widen the page's own network policy. It does not load `file://`: the built renderer is served from a
registered `app://notes` scheme, both because the collaboration server refuses a
socket whose origin it does not know and because a `file://` page is not a secure
context and therefore has no IndexedDB. A content security policy written into
the production HTML names exactly the two remote origins the app may reach —
Supabase and the collaboration server, each under both `https` and `wss`, because
Chromium does not match a `wss://` request against an `https://` source
expression — and everything else is refused. Links inside a note open in the
reader's own browser rather than in the application's window.

**Distributed builds are unsigned.** macOS reports an unsigned `.dmg` as
damaged, and the instruction to open it from the right-click menu is the same
instruction that would open a tampered one, so the download is only as
trustworthy as the Releases page it came from. Signing needs an Apple Developer
ID and a Windows certificate; `CSC_LINK` and `CSC_KEY_PASSWORD` plus dropping
the `identity: null` line is the whole of the change.

Live documents pass through the Hocuspocus service. One WebSocket carries the
whole session and every note opened in it, so the unit of authorization is the
document, not the connection: `onAuthenticate`, `onTokenSync` and
`beforeHandleMessage` each resolve the note from the document name and
authorize that note with the caller's Supabase token, and the check is repeated
while the connection stays open. Sharing a socket therefore grants nothing —
a second note on an open connection is authorized exactly as the first was.
Membership, Trash state, archived-note visibility and `notes.locked_by` remain
Supabase decisions, read through the caller's own token.

A **passage** lock is the one boundary here that Postgres cannot hold, and it is
worth being exact about what it is worth. The mark lives inside a Yjs document
both members are entitled to write, so no policy will ever see it; the
collaboration server holds it instead, by remembering what every foreign lock
covered before an update and restoring it afterwards if it changed. What that
buys: a client cannot make a change to somebody else's locked passage stick —
it reaches neither the holder's tab nor Postgres. What it does not buy: nothing
is encrypted, both members already read every word of the note, and a member who
runs their own client can still see the passage and still know it is locked. It
is a boundary against writing, not against reading, and it ends where the
collaboration server's authority ends. Awareness identity is overwritten by the server, so a
browser cannot choose another member's name or id. `note_documents` has RLS
enabled and grants no browser policy: only the service role persists its binary.
Redis/Valkey distributes updates between instances and is not durable storage.

IndexedDB Yjs stores are plaintext, scoped by archive, account and note. A
cached document still never authorizes its own display — it is only ever a
faster source for a note something else has already permitted. What permits it
is Postgres: the client opens an editor only for a note present in the
catalogue row level security returned for this session, so a former member, a
signed-out browser or an offline tab with a stale store is handed no row and
gets no editor. Writing is unchanged and remains the collaboration server's
decision, taken per document and repeated on every message.

Explicit sign-out asks for consent to remove this account's local copies,
including edits that have not reached the server. It closes the account's
providers, waits for IndexedDB deletion to complete, clears the note and image
caches, and only then removes the session. Another open tab is asked to release
its documents; a blocked or failed deletion is an error, not reported as
successful sign-out. The phone additionally waits for its editor WebView to
acknowledge removal in that separate storage realm. Saved accounts belonging
to other people are not removed.

Automatic inactivity locking and account switching retain Yjs stores so offline
edits can be recovered after signing in again. The inactivity lock hides the
archive immediately without waiting for a network flush. These retained copies
are still plaintext; locking is not disk encryption. Native device validation
of the WebView cleanup remains part of release QA; browser and bundled-editor
coverage is documented in `docs/quality-hardening.md`.

Two further caches hold archive content on the device. `napp:notes` (IndexedDB,
`packages/core/src/lib/noteStore.ts`) keeps the note payloads `loadArchive` would otherwise
re-fetch in full on every visit, and `napp:image:v1` (Cache API,
`packages/core/src/lib/media.ts`) keeps note photographs and cover pictures. Neither is ever
consulted for a permission: a cached note is redrawn only after Postgres has
returned the row under RLS, and a cached picture only for an object the archive
still names. `clearSession()` empties the note store on sign-out. Explicit
device-content removal additionally clears the image cache and the account's
Yjs databases.

The browser receives only the Supabase project URL, publishable key and public
collaboration URL. Service role keys, account passwords, session tokens, and
migration credentials must never be committed, placed in Vite variables, or
included in a build.

## Account erasure and abuse controls

Deletion requires a valid Auth identity, fresh password and explicit confirmation.
A service-only transaction prepares a Storage manifest and removes owned content;
the Edge worker deletes files through the API before removing Auth. Durable jobs
retry each minute. Other authors' documents, edits and necessary files remain.
The requesting device attempts to remove the erased account's sessions, snapshots
and Yjs/image/note caches; exported copies and offline devices cannot be recalled.
Tombstones and write guards prevent stale clients from recreating erased data.
See `docs/account-deletion-handoff.md` for the deployed contract and fixture tests.

Reports are private, operator review is service-only, and restrictive RLS filters
notes/comments/files. Blocks stop direct invitations and hide the parties' own
content, while existing shared memberships and third-party documents remain.
Already downloaded files cannot be recalled; fresh authenticated Storage requests
are tested independently of cached responses. The collaboration server reads
authorization through the caller's token and rechecks it with a bounded TTL.

Production mail remains a launch blocker: public Auth was confirmed to auto-confirm
email on 24 October 2026. Store-readiness and moderation operations are tracked in
`docs/store-release-readiness.md` and `docs/moderation-operations.md`; this code
does not establish staffing, mail delivery, backup retention or store approval.
