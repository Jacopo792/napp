# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people, and only two, with asymmetric roles baked into the key model:

- **u1 (Jacopo, master).** Derives both keys at login, reads and writes every note in
  both archives, and switches between them with a `viewAs` toggle. This is the owner
  of the deployment and the person the interface is tuned for.
- **u2 (the second person).** Holds a single pre-derived key bundle. Sees only notes
  tagged `u2` and cannot read u1's archive.

Confirmed 2026-08-27: this arrangement stays exactly as it is. The redesign must not
merge the two archives, must not add co-presence or "shared with you" affordances, and
must keep the `viewAs` switch a u1-only control.

## Product Purpose

A private place to keep and write notes that no server operator can read. Notes live
encrypted (AES-256-GCM) as `.napp` files on a GitHub `data` branch; the SPA holds the
keys and does the crypto in the browser. There is no backend to trust, and no account
to create — a pasted login bundle is the whole authentication story.

Success is that writing in it feels better than the alternatives Jacopo already has
open, so the notes actually land here instead of in Apple Notes.

## Positioning

End-to-end encrypted notes with **zero infrastructure**: no server, no database, no
vendor account, hosted free on GitHub Pages with GitHub itself as the dumb encrypted
blob store. Competing note apps either hold the plaintext (Apple Notes, Notion) or
require a server to run (Obsidian Sync, Standard Notes). This one can be forked and
self-hosted by anyone with a GitHub account in ten minutes.

## Operating Context

- **Desktop only** (confirmed 2026-08-27). The window is wide, the input is a mouse
  and a keyboard, and touch targets are not a constraint. Design spends its whole
  budget on the large viewport.
- Sessions are long and reading-heavy, not stack-of-index-cards quick capture. The
  real corpus (observed in Jacopo's Apple Notes, 2026-08-27) is long-form study and
  research material in Italian: multi-section research maps, aphorism collections,
  vocabulary lists, technical snippets.
- **Titles are long.** Real examples run to 55+ characters
  (`MAPPA 5: SK GROUP (il chaebol che ha catturato i pezzi giusti)`). A note list that
  truncates titles to one short line destroys the user's own naming scheme.
- Content language is Italian; the interface language is English today.
- Every save is a commit to the `data` branch. Writes are visible, permanent, and
  network-bound — latency and save state are real facts the interface must not hide.

## Capabilities and Constraints

Confirmed functionality: create / edit / delete notes, autosave (1.5s debounce),
pinning, folders, colored tags, full-text search, drag a note onto a folder,
light/dark theme, and u1's `viewAs` archive switch. Opening a note is read-only
state selection: it must never update `updatedAt` or trigger a GitHub write.

**Editor direction (updated 2026-08-27):** keep the _invisible markdown_ editor in the
Bear model — markdown syntax renders as formatting while you type in one pane, with no
separate preview tab. A compact, dismissible formatting menu is now wanted for common
Markdown actions; the always-visible Edit/Live/Preview toolbar remains unwanted.

PDFs with selectable text may be imported locally into the current note. The browser
extracts the text without uploading the document; OCR and AI document analysis are not
part of this capability.

Technical constraints that outlive any design:

- React 19 + TanStack Router + Vite + Tailwind v4, deployed to GitHub Pages under a
  base path. No server-side anything.
- The GitHub PAT lives in `sessionStorage` inside the login bundle. Known weakness,
  recorded, not solved by design work.
- Concurrent edits are last-write-wins: a 409 is resolved by re-reading the SHA and
  overwriting. Undecided how to fix; the interface must not imply a merge happens.
- `notes/meta-{owner}.napp` holds folders, tags, and note→folder assignment as one
  encrypted blob per archive, saved whole.

## Brand Commitments

Jacopo directs the design system of **Pixel Services** (`Documents/Pixel Services/coding/Hosting/src/main/webui/app/assets/css/tailwind.css`) to be the visual
authority for the interface: DM Sans / Bricolage Grotesque / JetBrains Mono, oklch
tokens, `--radius: 0.45rem`, `--ease-premium`. The note body uses Source Serif 4 for
more comfortable long-form writing, and the surfaces may move toward cleaner cool
neutrals. Binding, but explicitly **not as a copy-paste**.

Standing exception: the sienna/orange `--primary` of that system is rejected. Azure
replaces it everywhere, including anywhere orange hides in warning tokens.

## Evidence on Hand

- Real note corpus readable via the Apple Notes connector — use it to size titles,
  previews, and reading measure honestly. Do not invent placeholder note content that
  is shorter or tidier than the real thing.
- No logo, no wordmark, no brand imagery exists for this app. Do not fabricate one.
- No users beyond the two. No testimonials, metrics, or adoption claims exist.

## Product Principles

1. **The words outrank the app.** Every surface that is not the note itself recedes:
   chrome is quiet, the writing area is the brightest and calmest thing on screen.
2. **Two archives, never blended.** The separation between u1 and u2 is a security
   boundary, so it is also a visual one. Never imply shared editing.
3. **Honest about the network.** Saving is a commit to GitHub and can fail. Show real
   save state; never fake instant persistence.
4. **Built for long notes and long titles.** Density decisions are validated against
   real 55-character titles and multi-screen bodies, not against synthetic short data.
5. **Keyboard-first on a wide screen.** Desktop-only is a licence to be dense, precise,
   and shortcut-driven rather than tap-friendly.

## Accessibility & Inclusion

No user-specific requirement established. Baseline still applies: visible focus rings,
AA contrast on text and on both themes, and `prefers-reduced-motion` respected — the
existing code already honors all three and must keep doing so.
