/* Preview fixture. Shaped after the real corpus: long study titles,
   multi-section bodies, a few short scraps. Nothing here is copied from a real
   note — it is authored material with the same dimensions, which is the point:
   density decisions must be judged against 55-character titles, not "Note 1". */
import type { Note, Meta } from "@/lib/types";
import {
  legacyMarkdownToRichText,
  richTextToPlainText,
} from "@/features/editor/lib/content";

/* Two stand-in member ids, so the preview exercises the same scope
   switching the real archive does. */
export const PREVIEW_U1 = "preview-member-1";
export const PREVIEW_U2 = "preview-member-2";

const F_STUDIO = "f-studio";
const F_APPUNTI = "f-appunti";
const F_TECNICA = "f-tecnica";

function iso(daysAgo: number, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 24, 0, 0);
  return d.toISOString();
}

type Seed = {
  title: string;
  body: string;
  days: number;
  folder: string | null;
  /* Strokes for a drawing appended to the note, as the document stores them:
     a JSON string, not an array. See `Drawing` in content.ts for why. */
  sketch?: string;
};

const SEEDS: Seed[] = [
  {
    title: "MAP 5: KOREAN CONGLOMERATES (and why nobody copied them)",
    folder: F_STUDIO,
    days: 0,
    body: `The point is not their size. It is **the cross-ownership structure**, which
allows one family to control thirty companies with 3% of the capital.

## How the ring works

The holding company does not own its subsidiaries directly. It owns a stake in
company A, which owns a stake in B, which in turn owns part of the holding
company. The ring closes and the amount of capital required collapses.

- The ring holds as long as none of its internal links is listed separately
- The 1999 reforms banned new rings, not existing ones
- The real cost is *governance*, not capital

## Why the model cannot be exported

It requires a banking system willing to lend to the structure rather than the
project. Outside a context in which the state implicitly guarantees the debt,
the ring is simply a risk multiplier.

> Anyone looking only at consolidated revenue cannot see the leverage. The leverage is the point.

---

To revisit: the comparison with Japanese keiretsu, which solve the same problem
by placing a bank at the centre instead of a family.`,
  },
  {
    title: "The Chip Supply Chain, from Sand to Photolithography",
    folder: F_STUDIO,
    days: 0,
    body: `Five stages, each with a different bottleneck.

### 1. Raw materials
Metallurgical silicon → polycrystalline silicon → ingot → wafer.
The bottleneck here is not technical but energetic.

### 2. Design
Foundries do not design. Designers do not manufacture. The separation is recent
and has created two industries with opposite margins.

### 3. Lithography
There is only one EUV supplier in the world. Every other part of the supply
chain is replaceable; this one is not.

\`\`\`
300 mm wafer → ~600 usable dies → 70–90% yield
\`\`\`

### 4. Packaging and testing
Historically the boring part. Not since 3D stacking began to matter.

### 5. Integration
Where value returns to whoever owns the relationship with the end customer.`,
  },
  {
    title: "Aphorisms",
    folder: F_APPUNTI,
    days: 1,
    body: `An open collection. No particular order.

- Those who do not know what they are looking for cannot understand what they find.
- Simplicity is what remains when you have finished removing, not when you have
  stopped adding.
- A plan rarely survives first contact with reality; a method does.
- *Festina lente.*`,
  },
  {
    title: "Discord Webhooks — the Smallest Payload That Works",
    folder: F_TECNICA,
    days: 2,
    body: `The shortest message Discord accepts without complaint:

\`\`\`json
{ "content": "hello", "username": "bot" }
\`\`\`

Practical notes:

1. Rate limit: 5 requests every 2 seconds per webhook. Beyond that, Discord
   returns 429 with \`retry_after\` in milliseconds.
2. \`embeds\` accepts at most 10 items, and the combined character count of all
   embeds cannot exceed 6,000.
3. A deleted webhook returns 401, not 404. It is worth distinguishing the two
   in retry logic.

See also [the official documentation](https://discord.com/developers/docs).`,
  },
  {
    title: "Words to Remember",
    folder: F_APPUNTI,
    days: 3,
    body: `**ambivalent** — having two opposing interpretations or tendencies
**caesura** — a sharp break, in metre or elsewhere
**epigone** — a follower who adds nothing to a master's work
**paralogism** — faulty reasoning made in good faith
**tautology** — a proposition that is true by virtue of its form alone`,
  },
  {
    title: "Petroleum Distillation: Why the Fractions Emerge in That Order",
    folder: F_STUDIO,
    days: 5,
    body: `The column does not separate by "type" but by **boiling point**, and the
order of the fractions simply follows increasing chain length.

| Fraction | Chain | °C |
|---|---|---|
| Gas | C1–C4 | < 40 |
| Petrol | C5–C10 | 40–200 |
| Kerosene | C10–C16 | 200–260 |
| Diesel | C14–C20 | 260–340 |
| Residue | > C20 | > 340 |

The longer the chain, the more dispersion forces hold it together and the more
energy is required to separate the molecules. That is all.`,
  },
  {
    title: "Electricity — Scattered Notes to Organise",
    folder: null,
    days: 8,
    body: `Voltage is a difference in electric potential, not a "quantity". Charge is the quantity.

Current is not "used up" as it passes through a load: the same amount enters and
leaves. Energy is what is consumed, and the voltage drop reveals it.

To clarify: why neutral is at ground potential but is not ground.`,
  },
  {
    title: "Drafts",
    folder: null,
    days: 14,
    /* Deliberately in one corner of the 1000 × 560 board rather than filling
       it: a row's glyph slot is 28 pixels, and a drawing measured by the sheet
       it was made on instead of by where its ink is arrives there as specks. */
    sketch: JSON.stringify([
      {
        d: "M100,180L120,110L165,80L215,95L235,145L205,190L150,195L115,160L130,120L175,105",
        color: "#5B9BFF",
        width: 6,
      },
      { d: "M95,215L300,205", color: "#F4C550", width: 6 },
    ]),
    body: `Things started and never finished. Do not delete.

- A piece on why concept maps work only when you draw them yourself
- The difference between understanding and remembering that you understood`,
  },
  {
    title: "BHAGAVAD GĪTĀ — the Problem of the Second Chapter",
    folder: F_STUDIO,
    days: 21,
    body: `Arjuna does not refuse to fight out of cowardice. He refuses because he has
understood something true: victory costs exactly what he wants to defend.

Kṛṣṇa's answer does not deny the cost. It shifts the question from the result
to the action. The move stands or falls on a single point: whether the self that
acts is the same self that reaps the result.`,
  },
  {
    title: "Untitled Test Note",
    folder: null,
    days: 40,
    body: "",
  },
];

export const FIXTURE_META: Meta = {
  v: 1,
  partnerName: "Lucile",
  folders: [
    { id: F_STUDIO, name: "Studio" },
    { id: F_APPUNTI, name: "Appunti" },
    { id: F_TECNICA, name: "Tecnica" },
  ],
  notes: SEEDS.map((s, i) => ({
    id: `n${i}`,
    folderId: s.folder,
  })),
};

export const FIXTURE_NOTES: Note[] = SEEDS.map((seed, index) => {
  const content = legacyMarkdownToRichText(seed.body);
  /* Markdown has no drawing, so a seed that wants one gets it appended here,
     which is where the real parser would have left it. */
  if (seed.sketch)
    content.content = [
      ...(content.content ?? []),
      { type: "drawing", attrs: { strokes: seed.sketch, surface: "board" } },
    ];
  return {
    id: `n${index}`,
    title: seed.title,
    body: richTextToPlainText(content),
    content,
    contentVersion: 0,
    legacyBody: seed.body,
    photo: null,
    cover: index === 0 ? { kind: "preset", id: "museum", position: 0.5 } : null,
    ownerId: PREVIEW_U1,
    createdAt: iso(seed.days + 30),
    updatedAt: iso(seed.days),
  };
});
