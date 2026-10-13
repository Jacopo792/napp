import assert from "node:assert/strict";
import test from "node:test";
import {
  bibliography,
  bibtexName,
  citationNumbers,
  citationText,
  parseSources,
  runsText,
  unlatex,
  type CitationContext,
  type Source,
} from "./citations.ts";

const BIB = String.raw`
@string{ul = "Università di Bologna"}
@comment{ ignored {entirely} }
@Article{rossi2020,
  author = {Rossi, Mario and Luigi Bianchi},
  title = {Il {DNA} delle parole},
  journal = "Rivista " # "di Linguistica",
  year = 2020, volume = {12}, number = {3}, pages = {45--67},
  doi = {10.1000/xyz}
}
@book{eco1975, author = {Umberto Eco}, title = {Trattato di semiotica generale},
  publisher = {Bompiani}, address = {Milano}, year = {1975}}
@phdthesis{verdi, author={Verdi, G. and van Beethoven, Ludwig and Ludwig van Beethoven and {World Health Organization}},
  title={Perch\'e no}, school = ul, year={2019}}
@misc{broken, title = {no closing
`;

test("BibTeX entries are read, with strings, joins and LaTeX", () => {
  const sources = parseSources(BIB);
  assert.deepEqual(
    sources.map((source) => source.id),
    ["rossi2020", "eco1975", "verdi", "broken"],
  );
  const [rossi, eco, verdi] = sources;
  assert.equal(rossi.type, "article-journal");
  assert.equal(rossi.title, "Il DNA delle parole");
  assert.equal(rossi["container-title"], "Rivista di Linguistica");
  assert.deepEqual(rossi.author, [
    { family: "Rossi", given: "Mario" },
    { family: "Bianchi", given: "Luigi" },
  ]);
  assert.equal(rossi.page, "45–67");
  assert.deepEqual(rossi.issued, { "date-parts": [[2020]] });
  assert.equal(eco["publisher-place"], "Milano");
  assert.equal(verdi.title, "Perché no");
  assert.equal(verdi.publisher, "Università di Bologna");
  assert.deepEqual(verdi.author?.slice(1), [
    { family: "van Beethoven", given: "Ludwig" },
    { family: "van Beethoven", given: "Ludwig" },
    { literal: "World Health Organization" },
  ]);
});

test("LaTeX letters and names", () => {
  assert.equal(
    unlatex(String.raw`G{\"o}del, Erd\H{o}s, \c{c}a, {\'\i}, \ss, a--b`),
    "Gödel, Erdős, ça, í, ß, a–b",
  );
  assert.deepEqual(bibtexName("Jean de La Fontaine"), { family: "de La Fontaine", given: "Jean" });
  assert.deepEqual(bibtexName("Plato"), { family: "Plato" });
});

test("CSL-JSON from Zotero is read rather than trusted", () => {
  const sources = parseSources(
    JSON.stringify([
      {
        id: "smith",
        type: "book",
        title: "  A   Book ",
        author: [{ family: "Smith", given: "Ann" }, { nonsense: 1 }],
        issued: { "date-parts": [["2001", 4]] },
        extra: "dropped",
      },
      { id: "bad key with spaces", title: "x" },
      { id: "smith", type: "book", title: "Later wins" },
    ]),
  );
  assert.deepEqual(sources, [{ id: "smith", type: "book", title: "Later wins" }]);
  assert.deepEqual(parseSources("{ not json"), []);
  assert.equal(parseSources(JSON.stringify({ items: [{ id: "a" }] }))[0].id, "a");
});

const sources = new Map<string, Source>(parseSources(BIB).map((source) => [source.id, source]));
const context = (
  style: CitationContext["style"],
  language: "it" | "en" = "en",
): CitationContext => ({
  style,
  language,
  sources,
  numbers: citationNumbers(["verdi", "eco1975", "verdi", "rossi2020", "nobody"]),
});

test("in-text citations in both styles", () => {
  assert.equal(citationText("eco1975", null, context("author-date")), "(Eco 1975)");
  assert.equal(
    citationText("rossi2020", "12", context("author-date")),
    "(Rossi and Bianchi 2020, p. 12)",
  );
  assert.equal(
    citationText("rossi2020", "12-15", context("author-date", "it")),
    "(Rossi e Bianchi 2020, pp. 12–15)",
  );
  assert.equal(
    citationText("verdi", "chap. 2", context("author-date")),
    "(Verdi et al. 2019, chap. 2)",
  );
  assert.equal(citationText("broken", null, context("author-date")), "(“no closing” n.d.)");
  assert.equal(citationText("rossi2020", "4", context("numeric")), "[3, p. 4]");
  assert.equal(citationText("gone", null, context("numeric")), "[gone?]");
});

test("the bibliography lists what is cited, sorted or numbered", () => {
  const byName = bibliography(context("author-date"));
  assert.deepEqual(
    byName.map((entry) => entry.key),
    ["eco1975", "rossi2020", "verdi"],
  );
  assert.equal(
    runsText(byName[0].runs),
    "Eco, Umberto. 1975. Trattato di semiotica generale. Milano: Bompiani.",
  );
  assert.equal(byName[0].runs.find((run) => run.italic)?.text, "Trattato di semiotica generale");
  assert.equal(
    runsText(byName[1].runs),
    "Rossi, Mario, and Luigi Bianchi. 2020. “Il DNA delle parole.” Rivista di Linguistica 12 (3): 45–67. https://doi.org/10.1000/xyz.",
  );
  const numbered = bibliography(context("numeric"));
  assert.deepEqual(
    numbered.map((entry) => [entry.number, entry.key]),
    [
      [1, "verdi"],
      [2, "eco1975"],
      [3, "rossi2020"],
    ],
  );
  assert.equal(
    runsText(numbered[1].runs),
    "Eco, Umberto. Trattato di semiotica generale. Milano: Bompiani. 1975.",
  );
});
