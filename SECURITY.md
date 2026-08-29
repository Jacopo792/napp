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

The browser receives only the Supabase project URL and publishable key. Service
role keys, account passwords, session tokens, and migration credentials must
never be committed, placed in Vite variables, or included in a build.
