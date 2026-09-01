/* Preview fixture. Shaped after the real corpus: long Italian study titles,
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

type Seed = { title: string; body: string; days: number; folder: string | null };

const SEEDS: Seed[] = [
  {
    title: "MAPPA 5: I CONGLOMERATI COREANI (e perché nessuno li ha copiati)",
    folder: F_STUDIO,
    days: 0,
    body: `Il punto non è la dimensione. È **la struttura di controllo incrociato**, che
permette a una famiglia di governare trenta società con il 3% del capitale.

## Come funziona l'anello

La holding non possiede direttamente le controllate. Possiede una quota della
società A, che possiede una quota di B, che a sua volta rientra nel capitale
della holding. L'anello si chiude e il capitale necessario crolla.

- L'anello regge finché nessun anello interno viene quotato separatamente
- Le riforme del 1999 hanno vietato i nuovi anelli, non quelli esistenti
- Il costo reale è la *governance*, non il capitale

## Perché il modello non si esporta

Serve un sistema bancario disposto a prestare alla struttura invece che al
progetto. Fuori da un contesto in cui lo Stato garantisce implicitamente il
debito, l'anello è semplicemente un moltiplicatore di rischio.

> Chi guarda solo il fatturato consolidato non vede la leva. La leva è la cosa.

---

Da riprendere: il confronto con i keiretsu giapponesi, che risolvono lo stesso
problema con la banca al centro invece che con la famiglia.`,
  },
  {
    title: "La filiera dei chip, dal sabbia alla fotolitografia",
    folder: F_STUDIO,
    days: 0,
    body: `Cinque stadi, e in ognuno c'è un collo di bottiglia diverso.

### 1. Materia prima
Silicio metallurgico → silicio policristallino → lingotto → wafer.
Il collo di bottiglia qui non è tecnico ma energetico.

### 2. Progettazione
Le fonderie non progettano. Chi progetta non produce. La separazione è recente
e ha creato due industrie con margini opposti.

### 3. Litografia
Un solo fornitore al mondo per l'EUV. Tutto il resto della filiera è
sostituibile; questo no.

\`\`\`
wafer 300mm → ~600 die utili → resa 70-90%
\`\`\`

### 4. Packaging e test
Storicamente la parte noiosa. Da quando lo stacking 3D conta, non più.

### 5. Integrazione
Dove il valore torna a chi ha il rapporto col cliente finale.`,
  },
  {
    title: "Aforismi",
    folder: F_APPUNTI,
    days: 1,
    body: `Raccolta aperta. Nessun ordine.

- Chi non sa cosa cerca non capisce cosa trova.
- La semplicità è ciò che resta quando hai finito di togliere, non quando hai
  smesso di aggiungere.
- Il piano sopravvive raramente al primo contatto con i fatti; il metodo sì.
- *Festina lente.*`,
  },
  {
    title: "Discord web hooks — payload minimo che funziona",
    folder: F_TECNICA,
    days: 2,
    body: `Il messaggio più corto che Discord accetta senza lamentarsi:

\`\`\`json
{ "content": "ciao", "username": "bot" }
\`\`\`

Note pratiche:

1. Rate limit: 5 richieste ogni 2 secondi per webhook. Oltre, 429 con
   \`retry_after\` in millisecondi.
2. \`embeds\` accetta al massimo 10 elementi, e il totale dei caratteri di tutti
   gli embed non può superare 6000.
3. Un webhook cancellato risponde 401, non 404. Vale la pena distinguerli nel
   codice di retry.

Vedi anche [la documentazione ufficiale](https://discord.com/developers/docs).`,
  },
  {
    title: "Parole da memorizzare",
    folder: F_APPUNTI,
    days: 3,
    body: `**ancipite** — a due punte, ambiguo
**cesura** — interruzione netta, in metrica e altrove
**epigono** — chi segue un maestro senza aggiungere nulla
**paralogismo** — ragionamento scorretto ma in buona fede
**tautologia** — proposizione vera per sola forma`,
  },
  {
    title: "Distillazione del petrolio: perché le frazioni escono in quell'ordine",
    folder: F_STUDIO,
    days: 5,
    body: `La colonna non separa per "tipo" ma per **temperatura di ebollizione**, e
l'ordine delle frazioni è semplicemente l'ordine crescente della lunghezza
della catena.

| Frazione | Catena | °C |
|---|---|---|
| Gas | C1–C4 | < 40 |
| Benzina | C5–C10 | 40–200 |
| Cherosene | C10–C16 | 200–260 |
| Gasolio | C14–C20 | 260–340 |
| Residuo | > C20 | > 340 |

Più la catena è lunga, più forze di dispersione tiene insieme, più energia
serve per staccare le molecole. Tutto qui.`,
  },
  {
    title: "Elettricità — appunti sparsi da sistemare",
    folder: null,
    days: 8,
    body: `Tensione è differenza di potenziale, non "quantità". La quantità è la carica.

La corrente non "si consuma" attraversando un carico: entra ed esce identica.
Ciò che si consuma è l'energia, e si vede nella caduta di tensione.

Da chiarire: perché il neutro è a potenziale di terra ma non è la terra.`,
  },
  {
    title: "Abbozzi",
    folder: null,
    days: 14,
    body: `Cose iniziate e mai finite. Non cancellare.

- Un pezzo sul perché le mappe concettuali funzionano solo se le disegni tu
- La differenza tra capire e ricordare di aver capito`,
  },
  {
    title: "BHAGAVAD GĪTĀ — il problema del secondo capitolo",
    folder: F_STUDIO,
    days: 21,
    body: `Arjuna non rifiuta di combattere per codardia. Rifiuta perché ha capito
qualcosa di vero: che la vittoria costa esattamente ciò che vuole difendere.

La risposta di Kṛṣṇa non nega il costo. Sposta la domanda dal risultato
all'azione. È una mossa che regge o crolla su un punto solo: se il sé che
agisce sia lo stesso sé che raccoglie il risultato.`,
  },
  {
    title: "Nota senza titolo di prova",
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
