# Changelog

This file records user-visible changes and security-relevant architecture
changes. The commit history remains the detailed engineering record.

## Unreleased

### Fixed

- **The macOS download said it was damaged, and it was not.** The app was built
  with signing switched off entirely, which left the downloaded Electron
  binary's own signature over a bundle whose contents had since been replaced —
  a broken seal, which macOS reports as "damaged" and offers only the Bin for.
  The bundle is now sealed ad-hoc at build time, so the first launch is the
  ordinary refusal you answer once in Privacy & Security. Nobody has to remove
  the quarantine attribute from a terminal any more.
- **One background at a time.** With a picture of your own set, the folders
  column showed the desktop behind the window while the note showed your
  picture — two grounds side by side, which reads as a hole in the window rather
  than as a material. The system's material is now used only when Translucency
  is on and no picture has been chosen, and a picture runs under the whole
  window as it does in the browser. Translucency, which is off by default, now
  governs the surface it is named after.
- **Windows: the window no longer scrolls under its own title bar.** The band
  held for the caption buttons was measured outside the shell rather than
  inside it, so the page came out taller than the window by exactly that band.
  It also stays held open in full screen, where the buttons are gone.
- **Windows: menus are the application's own again**, rather than the operating
  system's — a system menu is drawn from the system's theme, not the palette
  you chose here.
- **Shortcuts are named after the keys on your keyboard.** The list, Settings,
  the ⋯ menu and the toolbar said ⌘ on machines that have none. The keys
  themselves always worked.

### Added

- **The window says when it is out of date.** A tab is always the version that
  was last deployed; an installed application can sit months behind without
  anything saying so. The desktop app now asks GitHub twice a working day
  whether a newer release exists, and says so on one line above "Lock & sign
  out" that opens the download page. The check runs in the main process, so the
  page's network policy is not widened to reach GitHub, and nothing is added to
  the preload bridge for the renderer to call — the answer arrives as a DOM
  event and the browser build never hears one.
- **A desktop window that behaves like one.** The application now ships as a
  macOS `.dmg` for Apple Silicon and a Windows installer, built on a tag, and
  the window has what a window has: a real menu bar whose every archive command
  presses the key the interface already answers to, the system's own text
  services (Emoji & Symbols, smart quotes, smart dashes, text replacement), a
  gutter for the three traffic lights that follows the leftmost column and
  disappears in full screen, a toolbar you can drag the window by, a title that
  names the note you are reading, and an icon cut to the platform's template
  carrying the count of unread remarks. None of it changes the interface: the
  same core mounts in a browser tab unchanged.
- **The swipe, in every scope.** A catalogue row answers a sideways push — a
  finger, or two fingers on a trackpad — and the action is a surface behind the
  row that the row uncovers as it travels. Let go partway and the row stays open
  with its button showing; push past the far threshold and it happens on
  release. Left uncovers the destructive one, right the one that files it. The
  list deletes and archives, the Archive deletes and puts back, the Trash
  deletes for good and restores — and a full swipe may never do something
  irreversible, so deleting for good stays a deliberate press.
- **Notes worth reading, marked.** A dot on a catalogue row's leading slot says
  the note carries a remark this account has not read, so the badge in the
  sidebar has something findable under it.

- **Live collaborative documents.** Title and rich-text content now share one
  Yjs document served by Hocuspocus. Supabase still decides access through
  `archive_members`; Redis/Valkey connects overlapping server instances; an
  authorized open note keeps accepting edits offline and converges on
  reconnect. The toolbar reports Connecting, Live, Offline or Unavailable.
- **A picture per note.** Right-click a note and give it a photograph of its
  own, cut in the same round window the profile picture uses. It stands where
  the document glyph stands in the list, and beside the title on the page, so
  a note you recognise by sight no longer has to be read to be found. It is
  kept in the column the retired emoji icons used, in the archive's private
  image bucket like every other picture here.
- **Page covers in the existing interface.** A note may use one of six curated
  covers or a private uploaded image, reposition it vertically, and replace or
  remove it without rewriting the live document.
- **Operational collaboration service.** `/healthz` is dependency-free
  liveness, `/readyz` checks Supabase and optional Redis with timeouts, and CI
  runs the real local integration, multi-instance and Docker checks before
  publishing.
- **An archive for notes, and the first thing in this archive one member can
  keep from another.** Archive sits above Trash in the sidebar and is the other
  kind of leaving: a trashed note is read-only and on its way out, an archived
  note is filed off the folder list and still yours to edit. A note that is both
  reads as trashed. In Settings, "Keep archived notes private" withholds your
  archived notes from the other members — and it is a row-level policy, not a
  filtered list: `notes_member_select` calls
  `private.archived_note_visible()`, which reads `profiles.hide_archived` from
  the owner's own row, and the same predicate guards update and delete, because
  a row you cannot see must not be a row you can write. Hiding a list in the
  browser would have handed the rows over first. Bounded deliberately, and
  recorded in `SECURITY.md`: the other member's client cannot fetch the row,
  and nothing here is encrypted, so it hides a note from a member and never
  from the database. Default off — nothing visible today stops being visible.
- **A proofreader that runs on this device.** Select a passage and the Language
  tools menu will fix its spelling, grammar and punctuation using the browser's
  built-in model — the same family as the translator already there, so there is
  no API key, token store or remote request. The readout says how many
  corrections were applied, because replacing a passage silently leaves you
  unable to tell a clean paragraph from one the model declined to touch, and
  nothing to fix writes nothing at all: no undo step, no dirtied draft. It can
  be switched off in Settings, and then its row is absent from the menu rather
  than greyed out.
- **Small spelling fixes while writing.** When an unambiguous English
  contraction is completed, such as `doesnt`, it becomes `doesn't` directly in
  the editor. The list is deliberately conservative, lives entirely on the
  device, and stops correcting a spelling after doing so twice: a third use is
  the writer's choice, not something the editor fights forever.

- **Markdown in and out, which is the whole of the interoperability.** A note
  can be copied as Markdown or exported as a `.md` file from its ⋯ menu, and
  the list's ⋯ exports everything it is showing — a folder of `.md` files where
  the browser can write one, which is exactly what an Obsidian vault is, and
  one combined file where it cannot. `.md` files import back, taking their
  title from a leading `# heading` or from the filename. Copying is what Notion
  and Google Docs read from the clipboard, and Apple Notes has no API at all,
  so a file and a clipboard reach all three without an OAuth client secret, a
  token store, or the server this project does not have. Images and attachments
  leave as a `napp-image:` reference rather than as bytes: a note that leaves
  and comes back here is whole, and the same file in Obsidian shows a broken
  link where the picture was.
- **Who else is in the note you are writing.** With live presence on, the other
  member appears on the right of the note's own header — beside the save
  readout, which is the other thing there that describes the note rather than
  you — as a pill carrying their picture and a caret while they are actually
  typing. Their name is on the tooltip: that side of the toolbar also holds two
  buttons, and a name set there is squeezed past legibility. It is filtered to
  the note that is open, so the roster in Settings still answers "who is
  online" and the header answers the narrower question you have while writing.
  The presence payload gained `noteId` and a `typing` flag; the channel, its
  RLS and its mutuality are unchanged, so nothing renders unless both sides
  have presence on.
- **Taking a note back.** **Only I may write this**, in the ⋯ menu a note's
  other actions live in and on its row in the list, sets `notes.locked_by` — the
  one account that may write the note. It is a database rule, not a disabled
  button: `notes_editor_update` refuses the other member the row, the trash
  stamp and the lock itself, and the collaboration server asks the same question
  of the live document, which the service role writes and row level security
  therefore never sees. Remarks are deliberately outside it, because a remark
  about a passage is the use of locking one. Requires migration
  `20260902020000_note_write_lock`.
- **Taking a passage back.** The lock in the selection toolbar holds a sentence
  rather than a note. It is a mark in the note's own Yjs document, so it moves
  with the words the way a comment anchor does — and, living inside a document
  both members may write, it is the one boundary here no policy can hold. The
  collaboration server holds it: it remembers what every foreign lock covered
  before an update and puts it back if the update changed it, so a write under
  somebody else's lock reaches neither their tab nor Postgres. A passage
  somebody else holds is tinted and refuses the caret. What this is and is not
  worth is recorded in `SECURITY.md`.
- **A drawing in the note.** A sheet you draw on by hand, from the palette menu
  or `/drawing`, with six inks, undo and clear. The strokes are the block's own
  attribute — no upload, no Storage object, nothing that can be missing when the
  note is read — so a drawing travels with the document the way a paragraph
  does, and leaves in an exported file as inline SVG that renders in the vault
  it lands in.
- **Remarks.** A place in the sidebar, above Archive, holding the notes with a
  conversation nobody has resolved; a note leaves it the moment its last thread
  is dealt with, and opening one from there opens its conversation with it. The
  badge counts what the other member has said, in an open thread, since this
  **account** last looked — a timestamp per note carried in
  `profile_preferences`, with `localStorage` as the device's cache for the first
  paint. A dot on the row's leading slot says which notes those remarks are on.

### Changed

- **The workspace is three flush columns, not three floating cards.** Divided
  by a one-pixel seam that is also the resizer, under one band of chrome running
  the width of the window. The gutter and the two ten-pixel seams were 40 px of
  a narrow window spent on air.
- **Read watermarks belong to the account, not the device.** Installing the
  desktop app used to produce a badge for every conversation already read in the
  browser, with no way to clear it but opening every note again. The per-note
  stamps now travel in `profile_preferences`; they are the one field in that
  blob that is not last-write-wins, because a watermark's answer to "which of
  these two devices is right" is neither — it is the further one.
- **An edit shows up in about half the time.** The collaboration server's
  persistence debounce is 1000 ms rather than 2000, which was most of the wait
  before an edit existed for anybody; the client answers a burst of the
  resulting announcements with one snapshot read rather than one each.
- **The keep-awake schedule covers the rest of the day, not the hour.** GitHub
  fired the hourly job three times in twenty-four hours, leaving the
  collaboration server asleep through a thirteen-hour gap. Each run now pings
  until the window closes.

### Removed

- **The viewer role, from the interface.** An archive built for two writers has
  no honest answer to which of them is the reader, and the choice was offered at
  every invitation and on every roster row. It is gone from Settings, everybody
  who joins joins able to write, and every member the archive already held was
  promoted to `editor` by the migration. `archive_members.role`, its policies
  and `set_archive_member_role()` all still stand in Postgres, so an archive
  that ever wants a reader can still have one; the interface simply stops
  asking. What one member takes back from another is now a note or a passage.
- **Fourteen paragraphs of helper prose.** Explanations under menus, cards and
  settings sections, saying what the control above them already said — and
  ageing worse than it: three were still describing the viewer role. Status and
  error lines stay, being the interface answering rather than lecturing, and the
  reason a disabled control is disabled moved into the naming line the settings
  row already has.
- **The page icon.** An emoji or line symbol above the title said less about a
  note than a picture of it does, and the picker was a grid nobody returned to.
  The photograph above replaces it. Icons already chosen stop being displayed;
  the column still accepts their shape, so no stored row was invalidated.

### Fixed

- **A drawing was unreadable as a note's icon, in two different ways.** The
  thumbnail is now measured by where the ink actually is rather than by the
  sheet it was drawn on, so a sketch in one corner of a board no longer arrives
  in the list as four specks; and selecting the row no longer fills the slot
  with the accent colour, which on a pink palette painted a pastel drawing out
  of existence entirely. The note's own photograph already opted out of that
  fill; the drawing now does too.
- **Panes kept their stored width while the window shrank**, so the writing
  column took the whole difference: at 900 px it was 232 px wide and everything
  in its toolbar was printed on top of everything else. The shown widths are
  clamped to the room there is; the stored ones are untouched, so widening the
  window puts the panes back where they were.
- **The saved readout was printed over the last tool.** The strip is a
  three-column grid and the right-hand group needed 244 px in a 196 px track; a
  grid item wider than its track overflows rather than shrinking. The threshold
  that chooses one row or two is now the arithmetic that decides it.
- **A long-open window stopped hearing that rows had changed.** A Realtime
  channel does not survive a closed lid, and it fails silently — the edit landed
  in Postgres with the right stamp and the list beside it went on showing
  yesterday, which reads exactly like the save not working. The window now
  notices it has come back, on three signals: the page becoming visible, the
  network returning, and a clock that jumped, which is the only one that catches
  a laptop that slept with the window still "visible".
- **An announcement arriving mid-read was dropped.** The read already running
  had asked the database before that change, so the last word of a burst could
  sit unread until something else happened to move. It is repeated once now.
- **Two rows at the top of the window were out of true.** The scope switch and
  the search field beside it started 12 px apart, and the traffic-light gutter
  was tight enough that the avatar touched the green button.

- **A note with a cover would not scroll.** The run-out below the last line was
  padding on the scrolling box itself, which is `height: 100%` and
  `border-box`: once a cover left the editor shorter than that padding, the
  used height snapped up to the padding alone and the box overflowed the pane
  it was meant to fit, taking the end of the text below the clip. The padding
  belongs to the content, not to the box that scrolls it.
- **Change cover and Remove did nothing once a picture was set.** The cover
  captured the pointer on every press so the focal point could be dragged, and
  a captured pointer takes the click that follows with it — to the cover,
  never to the button under the finger.
- **Choosing a new cover threw its focal point back to the top.** The
  `background` shorthand was written beside `background-position`, and only the
  properties that changed are rewritten, so the shorthand quietly reset what
  the drag had set.
- **Giving a note a picture pushed the note down.** The row the photograph sits
  in was removed whenever it had nothing to show — no picture, and either a
  cover already set or no right to add one — so it stood at nothing, 41 or 47
  pixels deep depending on the note, and the date, the title and the whole body
  moved with it. The row is always drawn now, at the photograph's own 40
  pixels, so the picture arrives into space that was already reserved for it
  and the title sits at the same height in every combination of picture and
  cover.
- **An undone edit still said it had been edited.** Typing and returning a note
  exactly to its previous contents now cancels the queued save. If an autosave
  landed in the middle, restoring the old contents restores the prior edit time
  too, so the note neither moves nor claims a change that did not survive.
- **Every address but the root returned GitHub's own 404.** Pages serves files
  and the application is one file, so a refresh on `/note-sharing-app/notes`
  found nothing and the reader had to walk back to the root. The build now also
  writes `404.html`, which is what Pages serves for an unknown path.
- **The controls on a note row were invisible until the pointer arrived.** Pin,
  restore and delete were `md:opacity-0`, so Trash in particular read as a list
  you could not act on. They are visible now.
- **The two muted inks were under AA.** `--ink-4` sat at 3.7:1 against the
  catalogue, which is why idle glyphs read as disabled. 4.9:1 and 6.5:1 now,
  and every metadata line in the app moves with them.
- **`theme-color` was nailed to the graphite default**, so the Paper theme drew
  a black band above a white app. It follows the reader's background.

- **Email confirmation is off, and no confirmation email ever arrived.**
  Supabase's built-in mail service only delivers to the project's own team
  addresses, so the message reached nobody else and no account could be
  finished. Confirmation is disabled at the owner's request.
  `20260830040000_invites_without_email_confirmation.sql` removes the matching
  `email_confirmed_at` check from `private.redeem_archive_invite()` — left in
  place it would have made every invitation permanently unclaimable. The
  address must still match the invited one, but it is no longer proof of owning
  that mailbox: the one-time token is now the whole of an invitation's secret.
  `SECURITY.md` states the trade and how to restore the earlier guarantee.
- **The confirmation email pointed at an old Vercel deployment.** The Supabase
  project's Site URL had never been aligned with `supabase/config.toml`, which
  already named `https://jacopo792.github.io/note-sharing-app/`. `supabase
config push` aligned it; the redirect allow-list now holds only that origin
  and localhost. Email confirmation stays on — `private.redeem_archive_invite()`
  refuses a caller whose `email_confirmed_at` is null, so turning it off would
  make invitations unclaimable.
- **A long address ran off the confirmation card.** It was set as the heading at
  display size, and an email has no spaces to wrap at. The heading is
  "Confirm your address" now and the address sits below it at reading size,
  allowed to break anywhere.
- **Links could not be clicked.** `openOnClick` was false, so clicking a link put
  a caret inside its text instead of opening it. A plain click opens the target
  in a new tab, with `rel="noopener noreferrer nofollow"`; editing a link goes
  through the toolbar's own fields.

- **Account creation.** Signing up failed with "Database error saving new user".
  The Supabase starter scaffold's `on_auth_user_created` trigger had survived the
  rename of `public.profiles` and still inserted into columns that had not
  existed since `20260829180000_member_profiles`, so every insert into
  `auth.users` raised inside it. `20260830020000_two_seat_archive.sql` drops the
  trigger and its function; the client's own `ensureProfile()` already wrote the
  profile row.

### Added

- **A two-seat rule enforced by the database.** `archives.seat_limit` defaults to
  `2` (accepting `1`-`8`), a `before insert` trigger on `archive_members` refuses
  the row past it, and `private.issue_archive_invite()` counts members plus
  unclaimed, unexpired invitations before issuing, so an unredeemable link is
  never created. Settings closes the form on the same arithmetic.
- **Withdrawing an invitation.** `revoke_archive_invite()` removes an unclaimed
  row after the same editor check that issuing makes, which destroys the stored
  digest, kills the link immediately, and returns the seat it was holding.
- **Sending an invitation by email.** A finished invitation offers the same
  one-time token two ways in the same place: copied, or handed to a `mailto:`
  the member's own mail app composes and sends. Nothing of ours receives it.
- **Members as a Settings section.** Roster, seats, pending invitations and the
  invite form move out of Security into their own section, opening on the seat
  count.
- **Placing the avatar.** A picture is dragged and zoomed behind a round window
  before upload, and the square that is uploaded is computed from the same three
  numbers the preview is drawn with, instead of being cut from the middle of the
  file. `src/lib/image.test.ts` covers the mapping.

### Changed

- **The login page separates its two modes.** Sign in and Create account are tabs
  at the top of the card, and the heading, sub-line, submit label and footnote
  belong to the tab showing. Both fields have a show/hide control. The
  confirmation state says what the emailed link does, that signing in comes after
  it, and where the archive comes from - without enumerating whether the address
  could be created.
- **Settings rows share one shape.** The profile picture became a row like the
  others, so every label starts at one x and every value ends at another; the
  notices in Members took the same card shape, and a section label after a card
  has room above it.

### Performance and visual

- `--shadow-soft` is a contact hairline plus a negatively spread pass instead of
  a 40 px blur spread evenly around every card, which over a wallpaper read as
  soot ringing the pane.
- The sidebar header no longer paints an opaque band across a translucent column,
  and the scope switch tints its track instead of plating it with a colour darker
  than the column holding it.
- Toolbars inside an already-translucent, already-blurred pane take neither the
  second coat nor the second `backdrop-filter`: one fewer full compositing pass
  per frame each, and no darker strip across the top of the column.
- The wallpaper layer declares `filter: none` at blur 0 rather than `blur(0)`,
  which was still promoting a viewport-sized fixed layer and running a pass.
- **Opening a note no longer builds a WebSocket to open it.** Each note was
  given a provider constructed from a URL, so it built and destroyed a
  connection of its own: a TCP handshake, a TLS handshake and a token round
  trip stood between the click and the first character, every time. One
  `HocuspocusProviderWebsocket` now serves the session and every note is
  multiplexed over it by document name, which is what the transport was always
  able to do. Measured against a live server, five notes cost five connections
  before and share one now: the count stops tracking the number of notes and
  moves only when the server itself closes the connection. Holding it open
  earns as much again: the collaboration instance sleeps when idle and takes
  about fifty seconds to wake, and an open socket is never idle, so that wait
  is paid once at sign-in instead of at whichever note switch happens to follow
  a quarter hour of reading.
  Authorization is unchanged — it was always per document, never per socket.
- A nickname arriving from the profile, or the presence preference being
  toggled, no longer tears the connection down and redoes the handshake. Both
  left the connection effect for one of their own.
- **Comments on a passage.** Select some text, press the comment button in the
  selection's own toolbar, and say what you think about it. The passage keeps a
  dashed underline; the panel beside the page holds the conversation, with
  replies, resolving, reopening, and deleting your own remarks.
  What ties a remark to the words is a mark in the note's own Yjs document, not
  a stored offset — so the passage keeps its comment through every edit either
  person makes above it, and converges the way the rest of the text does. The
  remarks themselves are rows in `note_comments`, under the same rule as the
  notes: members read, editors write, only the author deletes, and the author
  and the body of a remark cannot be rewritten afterwards. Markdown export
  carries the words and not the thread — a reader in Obsidian has no comment to
  open.
- **Add cover moves into the toolbar**, with the page's other controls. It was
  the one thing standing in the reading column that was not the note, and it
  never quite lined up with the column it stood in.
- **The time above a title is centred again.** On the left it joined the queue
  of things all starting at the same edge and made the head of the page read as
  one thin single-file line; over the measure it is a caption.
- **A note opens from this device, not from Frankfurt.** The editor waited for
  the collaboration server to authorize and sync before it would mount, so on
  the free plan — which sleeps after fifteen idle minutes — opening a note
  after a break meant about fifty seconds of empty page. The words are already
  on this machine, in the same IndexedDB Yjs store that has always been there,
  so they go on screen at once and the socket connects behind them.
  Nothing is granted by the cache. What permits a note to be drawn is Postgres:
  an editor is built only for a note present in the catalogue row level
  security returned for this session, so a former member, a signed-out browser
  or an offline tab with a stale store is handed no row and gets no editor.
  Writing is still the collaboration server's decision, on every message. An
  empty store is not a hit — an empty editor is worse than the bars that stand
  in for one — and because the store fills the _same_ document the server will
  update, its arrival is a merge into a live editor rather than the second
  build of a second document that once made the text paint twice.
- **Pictures are fetched once, not once per visit.** Note photographs and
  covers were held in a map that lived as long as the tab, so every reload sent
  the whole catalogue's pictures back to Storage in eu-west-1 — a fresh TLS
  handshake and about a third of a second each. They are kept in the Cache API
  now: measured in the browser, a cached picture is a 0.1 ms read instead.
- **The catalogue is not re-downloaded to draw a list.** `loadArchive` already
  refused to re-fetch a note whose version had not moved, but the versions
  lived only in memory, so every reload declared every note stale and pulled
  `title`, `body` and the entire Tiptap `content` of all of them in one query.
  The versioned cache is written to IndexedDB and read back beside the queries
  it saves, so a note crosses the wire when its version moves and not other-
  wise. It is emptied on sign-out.
- **Opening a note asks the archive two questions instead of three.** The
  collaboration server ran `getUser`, then the note, then membership and
  profile, each waiting for an id the one before produced. Only membership
  genuinely waits — it needs the archive the note turned out to belong to — so
  the rest now leave together. `getUser` still runs and still decides.
- **The other reader's caret never appeared while you wrote.** `onEdited` —
  which raises the "is writing" flag — sat in the branch taken only when
  collaboration is off, in both the body and the title. With collaboration on,
  which is always, typing announced nothing at all. Local document changes now
  raise it, and changes arriving from the other person do not: those carry
  `ySyncPluginKey`, and announcing on them would tell somebody you were writing
  because they were.
- **The tailpiece under a note is a rule and a lozenge.** It was a botanical
  plate drawn at 200x260 and asked to be 58 pixels wide at 16% opacity, which
  is a smudge, and it restaged its petal-by-petal draw on every note switch —
  motion that arrives each time you change page is motion you end up watching
  instead of reading. A hairline that fades at both ends, broken for a small
  lozenge, says "the note ends here" and says it legibly. The drawings stay on
  the sign-in screen, where they are given room.

### Removed

- The word-and-character metrics subsystem in the draft store - a second listener
  map, a per-note throttle timer, a counted-body cache and two counting helpers -
  which fed a readout the Tiptap editor no longer has. Typing a body now
  re-renders nothing at all. With it went `WorkspaceFooter`, `formatCount`,
  `countChars`, `isVirtualScope` and seven CSS rules for classes no component
  names.

### Editor (carried from the Tiptap migration)

- Replaced the source-text editor with a structured Tiptap document, including
  formatting, colours, checklists, editable tables, private media nodes and a
  reversible import path for existing notes.
- Added clipboard image insertion and concise table controls for deleting the
  selected row, column or table.
- Opening or focusing a note no longer emits an editor update or changes its
  modification time; only document-changing transactions enter the save queue.
- Organized the editor domain under `src/features/editor/`: four focused UI
  components and five small domain modules. `NoteList`, `Sidebar`,
  `WorkspaceMenus` and `notes.tsx` remain in their existing domains.
- Renamed the `preview` npm script to `preview:dist`; `preview:ui` remains the
  credential-free fixture on `localhost:5199`.
- Secured the Realtime Presence channel: `presence:<archiveId>` is now joined
  with `config.private = true` and the server allows `extension = 'presence'`
  only to members via `private.presence_archive_id()` in
  `supabase/migrations/20260829250000_private_archive_presence.sql` (`SELECT` to
  receive, `INSERT` to publish). Postgres Changes subscriptions remain public
  channels filtered by table RLS; `private_only` is not enabled globally.

## 2026-08-29 — Accounts, invitations, roles, avatars and private presence

### Added

- Public signup and email confirmation: the login route gains a sign-up mode with
  a neutral "check your email" confirmation state that does not enumerate
  addresses, and `ensure_personal_archive()` creates a personal archive
  atomically on first sign-in behind `private.bootstrap_personal_archive()`
  with an advisory lock.
- Multi-archive sign-in: `restoreSession` returns an archive chooser when the
  account holds more than one membership, instead of the old
  exactly-one-membership error.
- Archive invitations: `private.issue_archive_invite` returns a 64-hex raw token
  once and stores only its SHA-256 digest for seven days; `private.redeem_archive_invite`
  checks `auth.users.email_confirmed_at` and the lower-cased address before
  inserting `archive_members`. Re-inviting an unclaimed address rewrites the
  same row. The browser never resolves an email to a user id. Settings exposes a
  copyable link and the login flow can redeem an `?invite=` token.
- Explicit `editor` / `viewer` archive roles: `private.can_write_archive()` and
  the invitation / role RPCs enforce that only editors may write `archives`,
  `notes`, `folders`, `tags`, `note_tags` and `note-images`; viewers read
  everything but writes, invites and role changes are rejected, and the last
  editor cannot be demoted. Direct inserts/updates/deletes on
  `archive_members` are revoked; `create_archive_invite` requires a role choice.
- A roster of visible members and avatars: `public.profiles` (`nickname`,
  `avatar_object`) plus the private `avatars` bucket (`<userId>/<objectId>`),
  `private.shares_archive()` for reads, self-only writes, `src/lib/avatarCache.ts`
  with one object URL per avatar and Realtime updates, and a member list in
  Settings and avatar-framed segments in the scope switch.
- Mutual live presence: off by default, the client joins `presence:<archiveId>`
  only while broadcasting `{ userId, onlineAt }` and `realtime.messages` policies
  for `extension = 'presence'` (via `private.presence_archive_id()`) restrict it
  to members — `SELECT` to receive, `INSERT` to publish — on a private channel
  (`config.private = true`). The server derives the archive from
  `realtime.topic()`; Postgres Changes subscriptions are unchanged.
- Private vulnerability reporting and `SECURITY.md` with the Auth/RLS/Storage
  boundary as deployed.

### Changed

- `supabase/migrations/20260829220000_personal_archive_bootstrap.sql`,
  `…230000_archive_invitations.sql` and `…240000_archive_roles.sql` applied;
  the invitation RPC now carries a required `role`, and `archive_members` and
  `archive_invites` carry a `role` column with `editor`/`viewer` checks.
- Membership semantics clarified everywhere: every member can read; only editors
  write. Documentation (`README`, `PRODUCT`, `CLAUDE`, `DESIGN`) reflects the
  new signup, multi-archive, invitation, role, avatar and presence behavior, and
  the editor's new module location.

### Security

- `archive_members`, `archives`, `notes`, `folders`, `tags`, `note_tags` and
  `note-images` now enforce editor writes via `private.can_write_archive()`; the
  role assignment path is limited to `set_archive_member_role()` with a last-editor
  guard.
- `archive_invites` is member-select-only; writes go through security-definer
  functions that hash the token with `sha256`.
- `realtime.messages` now limits `presence` to archive members.
- Direct `archive_members` writes revoked for `authenticated`.

## 2026-08-29 — Public foundation

### Added

- Account profiles with nicknames and private avatar storage.
- Right-click menus for notes, folders, and the note page.
- Pull-request checks for lint, typecheck, tests, and production builds.
- A credential-free in-memory interface preview for contributors.
- GPL-3.0-or-later licensing and contributor documentation.

### Changed

- Replaced the two-person archive fixture with a roster of account members and
  one organizational scope per member.
- Rebuilt Settings around account, security, appearance, and reading sections.
- Renamed persistence states to Unsaved, Saving, Saved, Updated elsewhere, and
  Save failed, with stable toolbar geometry.
- Removed the retired encrypted client format and raw archive keys from browser
  storage after verifying that notes and files had already moved to ordinary
  account-protected storage.

### Fixed

- Kept toolbar controls from overlapping at narrow editor widths.
- Restored whole-pixel hairlines and overlay scrollbars.
- Corrected profile layout on phones and reduced-motion behavior in menus.
- Preserved production compatibility while retired database columns were
  removed after, rather than before, the compatible client deployment.

## 2026-08-28 — Supabase archive

### Added

- Supabase Auth, Postgres, Realtime, and private Storage as the application
  backend.
- Cross-account archive membership enforced by row-level security.
- Mobile navigation, Trash, PDF attachments, image paste, folders, tags,
  pinning, search, themes, wallpapers, and reading controls.

### Changed

- Replaced the legacy GitHub data branch with Supabase persistence while
  retaining the original branch as a migration backup.
