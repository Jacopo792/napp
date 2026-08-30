# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub private vulnerability reporting](https://github.com/Jacopo792/note-sharing-app/security/advisories/new).
Do not open a public issue for a vulnerability that could expose an archive,
an account, or a Storage object.

Include the affected surface, the steps needed to reproduce the problem, the
access level of the account you used, and the impact you observed. A minimal
proof of concept is useful; real notes, credentials, session tokens, and
personal files are not.

You should receive an acknowledgement within seven days. A fix will be
developed privately when disclosure before deployment would put existing
archives at risk.

## Supported version

Only the current `main` branch and the production build published from it are
supported. Older static builds may remain open in a browser tab, so database
changes must remain compatible with the last deployed client until the new
client has been published and checked.

## Security model

Supabase Auth identifies the account. Postgres row-level security authorizes
database access through `archive_members`, and private Storage applies the same
archive-membership boundary. `owner_id` is organizational metadata, not an
authorization boundary.

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

Membership is capped in the database, not in the interface. A `before insert`
trigger on `archive_members` refuses a row once the archive holds
`archives.seat_limit` members, so every path in — the personal-archive
bootstrap and invitation redemption alike — is covered by one check. Issuing an
invitation additionally counts unclaimed, unexpired invitations, so a link that
could never be redeemed is never created; `revoke_archive_invite()` deletes an
unclaimed row, which destroys the stored digest and invalidates the link
immediately.

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

The browser receives only the Supabase project URL and publishable key. Service
role keys, account passwords, session tokens, and migration credentials must
never be committed, placed in Vite variables, or included in a build.
