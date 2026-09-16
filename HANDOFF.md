# Handoff — UI, motion, correction, drawing

Working file for a run of work that spans several sessions. **Delete it when
the last block below is done**; nothing in the app reads it.

Branch: `claude/sharp-lamport-3kdbde`.

---

## How to look at what you are changing

There is no Supabase and no collaboration server in a fresh checkout, and you
do not need either: `pnpm preview:ui` runs the whole interface against the
in-memory fixture in `preview/`, on `localhost:5199`. Sign in with anything.

```bash
corepack prepare pnpm@latest --activate   # the repo needs pnpm >= 11
pnpm install
cp .env.example .env.local                # see below — four names, any values
pnpm preview:ui
```

`.env.local` is **required even for the preview**, and that is not documented
anywhere else: `packages/core/src/lib/supabaseClient.ts` constructs its client
at module scope and the harness does not mock _that_ module — only
`@/lib/supabase` above it. With the file missing, `/notes` throws
`supabaseUrl is required` into the error boundary and the window is blank. Any
syntactically valid values will do, because nothing ever calls out:

```
VITE_SUPABASE_URL=https://preview.invalid
VITE_SUPABASE_PUBLISHABLE_KEY=preview-anon-key
VITE_COLLAB_URL=ws://127.0.0.1:8080
VITE_WEB_ORIGIN=https://jacopo792.github.io/napp/
```

**A cloud session can drive it and take screenshots.** Chromium is at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; install `playwright` into
the scratchpad and launch with that `executablePath` and `--no-sandbox`. That
is how the two bugs below were reproduced rather than guessed at, and it is the
only honest way to close the ones that are left — `pnpm typecheck` has nothing
to say about a shortcut firing on the wrong element.

Before every push: `pnpm format && pnpm lint && pnpm typecheck && pnpm test`.

---

## Done in the first session

All four are on the branch and all of `lint`, `typecheck` and the 122 tests are
green.

### The correction while you type

It was not broken, it was two things that made it invisible, and the reading
"it worked and then it stopped" was literally true.

- The dictionary was sixteen **English** contractions, in an archive written in
  Italian. It is Italian now — accents and apostrophes — with the English kept.
- It stopped correcting a word after correcting it **twice, for ever**, on a
  count in `localStorage` that nothing cleared. The count is gone. A correction
  now stands until the writer **undoes** it: a ⌘Z within four seconds of one
  learns that spelling and it is never corrected again.
- The rule the dictionary is built on: a word that exists without its accent is
  never corrected. `sara`, `faro`, `meta`, `te`, `se`, `si`, `da`, `la`, `li`
  are all out on purpose. The apostrophe spellings (`e'`, `perche'`) are in,
  because the apostrophe is the writer saying which word they meant.
- `autocorrect` is a fifth `AccountFlag`, so it travels in `profile_preferences`
  like the rest. Settings → Writing has **Correct as I type**, and a second row
  that appears once something has been learned: _Words you kept · Forget N_.

Files: `features/editor/lib/autocorrect.ts` (+ test), the plugin in
`RichTextEditor.tsx`, `lib/preferenceShape.ts`, `lib/accountPreferences.ts`,
`components/SettingsPanel.tsx`, `screens/Notes.tsx`, `NoteEditor.tsx`,
`preview/accountPreferences.mock.ts`.

### The time, and "Updated elsewhere"

One slot, one truth. The centred date over the title was a caption with no
picture under it, and the header slot that reports on the note said nothing at
all until something happened to it — so they swapped. The slot's **resting**
state is now `Edited 22:11`, in the list's own shorthand because that box is
7.5rem and clips, with the full stamp on the tooltip.

That deletes "Updated elsewhere" for free: a change made in the other window
_is_ a new time, so the time arriving is the whole announcement — and unlike a
two-second blue flash it is still there when somebody looks up. `syncFlash` and
its timer are gone from `Notes.tsx`; `.note-date` is gone from `styles.css`.

### `?` opening the shortcut sheet while writing — the cause was not `?`

Reproduced, and it is **Enter in the title**. `TitleField` called
`event.currentTarget.blur()`, which is not the same thing as moving on: nothing
took the focus, so it landed on `<body>`, where every bare key in the window is
a shortcut. `?` opened the sheet, `n` wrote a new note, `j`/`k` changed which
note you were looking at. The global handler's `typing` guard was correct all
along and had nothing to guard.

Enter now puts the caret **in the note**, via a new `onDone` prop that
`NoteEditor` wires to the editor handle's `focus()`.

---

## Left to do

### B · Motion

Start by unifying the **two conflicting `.icon-button` blocks** in
`styles.css` (around lines 572 and 1950 — the second wins, so the first is
already dead weight that reads as live). Then animate inside the existing
budget: the file declares four curves and four durations and says in as many
words that nothing is allowed a fifth. `--ease-bounce` is only for a gesture
the hand has already let go of.

### C · The chrome in the fourth screenshot

The sidebar header (avatars, name, folder-plus, collapse) and the
`collection-toolbar` ("All notes / 18 notes / New note / ⋯") are two strips
that must read as one band across the window — see _Flush columns, one band of
chrome_ in `CLAUDE.md`, including the two things there that are load-bearing
and easy to undo by accident. `New note` is currently the only saturated object
in the whole window.

### D · The drawing toolkit — text, shapes, and moving what is drawn

The big one, and the only one that touches data already written into notes, so
it goes last and in commits of its own.

A stroke today is `{ d, color, width }` inside a JSON **string** (a string on
purpose: y-prosemirror diffs node attributes with `!==`, so an array would be
rewritten into the document on every keystroke anywhere in the note). That
string is read by `drawingStrokes()`, `drawingSvg()`, `drawingBox()`,
`drawingInkBox()` and `strokePoints()` in `features/editor/lib/content.ts`, by
`splitMediaStroke()` in `mediaInk.ts`, and by both exporters in `exportNote.ts`.

Widening it has to be **additive**: a stroke stays a stroke, and `text` and
`shape` arrive beside it with a discriminant, so a note written by today's
client still reads. `drawingStrokes()` already validates rather than trusts
what comes out — every new kind needs the same treatment there, including the
sanity bound on a width, which is the whole box and not the pen's own 40 for
the reason `mediaInk.ts` documents.

What the ask covers: straight lines and arrows as **deliberate tools** rather
than only as `straightenStroke`'s hold-still snap, rectangles and ellipses the
same way, text the way a story is captioned, a fill, and being able to pick a
mark up and move it. `useInk` in `RichTextEditor.tsx` already holds the ink,
the nib, the eraser and the gesture for all three surfaces (board, page,
picture), so the tools belong there and not in a fourth copy.

### Still to reproduce: video attachment

Reported as: a note that already has text will not take a video, a brand new
note will. Driven headlessly against the preview harness, **both** cases
reported `File attached` — so it was not reproduced, and neither `accept=` on
the input, `assertAttachable()`, nor `handleUploadFile()` reads anything about
the note's contents. Two things the harness cannot see and which are the next
places to look:

- `uploadObject` against the real bucket: `note-images` allows video MIME types
  only since `20260905010000_video_attachments.sql`, and the type is inferred
  from the **name's extension**, never `file.type`.
- The insert itself: `insertAttachment` runs `insertContent` on a `privateFile`
  node, which is `group: "block", atom: true`. Inserting a block atom at a
  caret inside a paragraph is the case an empty note never exercises. Watch
  what the node view does rather than what the status line says — the status
  line said "File attached" in both runs and no card appeared in either, which
  the preview's stubbed resolver may well explain and may well not.
