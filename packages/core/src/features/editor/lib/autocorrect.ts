/* ── The correction that happens while you write ──────────────────────────────
   Not the proofreader. That one is a model, it runs from a deliberate click on
   a selection, and it lives in `proofread.ts`. This is the small phone-style
   substitution that finishes a word the moment the word is finished — and it
   is a dictionary rather than a model, so it is instant, offline, and says
   nothing about a sentence it was not asked about.

   Two things were wrong with it and both made it invisible rather than wrong.

   It knew sixteen English contractions, in an archive written in Italian: on
   the words actually being typed here it had nothing to say, ever. And it
   stopped correcting a word after it had corrected it twice — a count kept in
   local storage that nothing ever cleared — so the reading "it used to work
   and then it stopped" was literally true, for every word, permanently.

   The count is gone. What replaces it is the rule a phone actually uses: a
   correction stands until the writer takes it back. Undo within a few seconds
   of one and that spelling is **learned** — it is the writer's own, and it is
   never corrected again. One ⌘Z is the whole of the vocabulary lesson, and it
   is what makes it affordable to correct a word that has a rare homograph:
   getting it wrong costs one keystroke once, rather than being a reason never
   to offer the correction at all. */

const LEARNED_KEY = "napp:autocorrect-learned";

/** Whether it runs at all. Cached here for the first paint; the authority is
 *  the account's row, the way every other switch in Settings works. */
const ON_KEY = "napp:autocorrect";

export function loadAutocorrectPreference(): boolean {
  try {
    /* Absent means on. It corrects a word only when the word is finished and
       one undo takes a correction back for good, so an untouched setting has
       nothing to interrupt. */
    return localStorage.getItem(ON_KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveAutocorrectPreference(on: boolean): void {
  try {
    localStorage.setItem(ON_KEY, on ? "on" : "off");
  } catch {
    /* No storage: the choice holds for this session and the row still has it. */
  }
}

/** The two-strikes counter this replaced. Read once, to be forgotten: a
 *  browser that has been using the app carries a count for every word it ever
 *  corrected, and leaving the key behind leaves the old rule's evidence in
 *  storage for whoever finds it next. */
const RETIRED_COUNTS_KEY = "napp:autocorrect-counts";

/* ── Italian ─────────────────────────────────────────────────────────────────
   The accent is the whole of it. Typing `perche` is not a spelling somebody
   believes in, it is the accent nobody reaches for in a hurry — which is
   exactly the correction that is easy to trust, because there is no second
   word it could have been.

   So the words with an unaccented homograph are **out**, and they are the ones
   that would otherwise be most tempting: `ne` (né / ne), `se` (sé / se), `si`
   (sì / si), `da` (dà / da), `e` (è / e), `la`, `li`, `sara` (sarà / Sara),
   `faro` (farò / faro), `meta` (metà / meta), `eta` (età / eta), `giacche`
   (giacché / giacche). Every one of them is a word in its own right, and a
   corrector that rewrites a word somebody meant is not a convenience.

   The apostrophe spellings — `e'`, `perche'`, `piu'` — are in, and they are
   safe for the opposite reason: nobody types an apostrophe there meaning
   anything else. So is the grave-for-acute slip, `perchè`, which is the most
   common written error in Italian and is unambiguous in the same way. */
const ITALIAN: Record<string, string> = {
  /* The conjunctions in -ché. An acute accent, always — `perchè` is the error
     and it is corrected to the same word the unaccented form is. */
  perche: "perché",
  "perche'": "perché",
  perchè: "perché",
  poiche: "poiché",
  poichè: "poiché",
  benche: "benché",
  benchè: "benché",
  affinche: "affinché",
  affinchè: "affinché",
  finche: "finché",
  finchè: "finché",
  anziche: "anziché",
  anzichè: "anziché",
  cosicche: "cosicché",
  cosicchè: "cosicché",
  nonche: "nonché",
  nonchè: "nonché",
  sicche: "sicché",
  sicchè: "sicché",
  purche: "purché",
  purchè: "purché",

  /* The everyday adverbs. None of them is a word without its accent. */
  piu: "più",
  "piu'": "più",
  gia: "già",
  "gia'": "già",
  puo: "può",
  "puo'": "può",
  cioe: "cioè",
  "cioe'": "cioè",
  percio: "perciò",
  "percio'": "perciò",
  cosi: "così",
  "cosi'": "così",
  pero: "però",
  "pero'": "però",

  /* The apostrophe spellings of the words that are otherwise left alone. The
     apostrophe is the writer saying which one they meant, so the accent is
     only finishing the job they started. */
  "e'": "è",
  "ne'": "né",
  "se'": "sé",
  "si'": "sì",
  "la'": "là",
  "li'": "lì",

  /* `po` is `po'` — the truncation, not the river, which is capitalised. And
     `pò` is the accent somebody reached for instead of the apostrophe, which
     is the single most corrected word in written Italian. */
  po: "po'",
  pò: "po'",

  /* The nouns in -tà and -tè, where the accent is the word. */
  citta: "città",
  "citta'": "città",
  universita: "università",
  "universita'": "università",
  liberta: "libertà",
  verita: "verità",
  qualita: "qualità",
  attivita: "attività",
  novita: "novità",
  possibilita: "possibilità",
  necessita: "necessità",
  identita: "identità",
  societa: "società",
  realta: "realtà",
  difficolta: "difficoltà",
  felicita: "felicità",
  velocita: "velocità",
  caffe: "caffè",
  "caffe'": "caffè",

  /* The days, which are all -dì and none of which is a word without it. */
  lunedi: "lunedì",
  martedi: "martedì",
  mercoledi: "mercoledì",
  giovedi: "giovedì",
  venerdi: "venerdì",

  /* The future, third person and first. `sara` and `faro` are left out: one is
     a name and the other is a lighthouse. */
  avra: "avrà",
  avro: "avrò",
  saro: "sarò",
  fara: "farà",
  verra: "verrà",
  verro: "verrò",
  andra: "andrà",
  andro: "andrò",
  potra: "potrà",
  potro: "potrò",
  dovra: "dovrà",
  dovro: "dovrò",
  vorra: "vorrà",
  vorro: "vorrò",
  sapra: "saprà",
  sapro: "saprò",
  stara: "starà",
  staro: "starò",
  dira: "dirà",
  diro: "dirò",
  dara: "darà",
  daro: "darò",

  /* The two elisions written as one word about as often as they are written
     correctly. */
  daccordo: "d'accordo",
  unaltra: "un'altra",
};

/* ── English ─────────────────────────────────────────────────────────────────
   The contractions where the apostrophe changes nothing but the spelling.
   Ambiguous words such as `its` stay out for the reason they always did. */
const ENGLISH: Record<string, string> = {
  arent: "aren't",
  cant: "can't",
  couldnt: "couldn't",
  didnt: "didn't",
  doesnt: "doesn't",
  dont: "don't",
  hadnt: "hadn't",
  hasnt: "hasn't",
  havent: "haven't",
  isnt: "isn't",
  shouldnt: "shouldn't",
  wasnt: "wasn't",
  werent: "weren't",
  wont: "won't",
  wouldnt: "wouldn't",
  youre: "you're",
  theyre: "they're",
  weve: "we've",
  ive: "I've",
  im: "I'm",
};

const CORRECTIONS: Record<string, string> = { ...ITALIAN, ...ENGLISH };

/** How many letters a word has to have before it is worth looking up. Below
 *  this every lookup is a miss, and the lookup happens on every word ending. */
const SHORTEST = 2;

/** The lookup, and nothing else — no storage, no learning, no clock. The half
 *  that is worth a test is the half that reaches nothing. */
export function correctionFor(word: string): string | null {
  if (word.length < SHORTEST) return null;
  const replacement = CORRECTIONS[word.toLocaleLowerCase("it")];
  if (!replacement) return null;

  /* The shape of what was typed, kept. `PERCHE` is somebody shouting and
     `Perche` is the start of a sentence; neither of them asked for a lowercase
     word back. A word of one letter is never "all caps", so the capitalised
     branch has to come first for it. */
  if (word.length > 1 && word === word.toLocaleUpperCase("it"))
    return replacement.toLocaleUpperCase("it");
  if (word[0] === word[0]?.toLocaleUpperCase("it"))
    return `${replacement[0]?.toLocaleUpperCase("it")}${replacement.slice(1)}`;
  return replacement;
}

function learned(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(LEARNED_KEY) ?? "[]");
    return new Set(Array.isArray(stored) ? stored.filter((w) => typeof w === "string") : []);
  } catch {
    return new Set();
  }
}

/** This spelling is the writer's own. Called when a correction is undone, and
 *  never again for that word — which is what makes the correction safe to
 *  offer in the first place. */
export function rememberSpelling(word: string): void {
  const key = word.toLocaleLowerCase("it");
  if (!CORRECTIONS[key]) return;
  try {
    const set = learned();
    if (set.has(key)) return;
    set.add(key);
    localStorage.setItem(LEARNED_KEY, JSON.stringify([...set].sort()));
    localStorage.removeItem(RETIRED_COUNTS_KEY);
  } catch {
    /* Nothing to learn into. The correction still stands for this session. */
  }
}

/** Every spelling this device has been taught to leave alone, so Settings can
 *  say how many there are and hand them back. */
export function learnedSpellings(): string[] {
  return [...learned()];
}

/** Forget every one of them. The row in Settings that says how many words have
 *  been learned is the only place this is reachable from — a writer who has
 *  refused a correction by accident has no other way back. */
export function forgetSpellings(): void {
  try {
    localStorage.removeItem(LEARNED_KEY);
    localStorage.removeItem(RETIRED_COUNTS_KEY);
  } catch {
    /* No storage, nothing learned, nothing to forget. */
  }
}

/** The correction for a word that has just been finished, or null — either
 *  because there is nothing to correct or because this writer has already said
 *  that spelling is theirs. */
export function takeAutocorrection(word: string): string | null {
  if (learned().has(word.toLocaleLowerCase("it"))) return null;
  return correctionFor(word);
}
