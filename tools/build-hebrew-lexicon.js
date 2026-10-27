/**
 * Builds functions/data/hebrew-lexicon.json from STEPBible's TBESH file.
 *
 * Source: "TBESH - Translators Brief lexicon of Extended Strongs for Hebrew - STEPBible.org CC BY.txt"
 *   https://github.com/STEPBible/STEPBible-Data/tree/master/Lexicons
 * Tyndale House Cambridge / STEPBible.org, CC BY 4.0. Definitions abridged from Brown-Driver-Briggs.
 *
 * Usage: node tools/build-hebrew-lexicon.js <path-to-TBESH.txt>
 *
 * Same shape as greek-lexicon.json: { _source, entries: { H3444: {...} }, index: { key: [ids] } }.
 * Only common words (morph "H:...") are kept; the proper-name rows (morph "N:...") would
 * triple the file and the engine is asked about words, not people.
 */

const fs = require("fs");
const path = require("path");

const input = process.argv[2];
if (!input) {
  console.error("Usage: node tools/build-hebrew-lexicon.js <path-to-TBESH.txt>");
  process.exit(1);
}

// Strip vowel points, cantillation and maqaf so יְשׁוּעָה and ישועה find the same entry.
function hebrewKey(t) {
  return String(t || "").replace(/[֑-ׇ]/g, "").replace(/[^א-ת]/g, "");
}

// "ye.shu.ah" → "yeshuah", "che.sed" → "chesed"
function latinKey(t) {
  return String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cleanDef(t) {
  return String(t || "")
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .replace(/(;\s*)+/g, "; ")
    .trim();
}

const entries = {};
const index = {};
const addKey = (k, id) => {
  if (!k) return;
  const list = index[k] || (index[k] = []);
  if (!list.includes(id)) list.push(id);
};

const lines = fs.readFileSync(input, "utf8").split(/\r?\n/);
for (const line of lines) {
  if (!/^H\d{4}/.test(line)) continue;
  const [eStrong, , , lemma, translit, morph, gloss, meaning] = line.split("\t");
  if (!morph || !morph.startsWith("H:")) continue;
  const id = eStrong.trim();
  if (entries[id]) continue; // first common-word row per number is the headword
  entries[id] = {
    s: id,
    lemma: lemma.trim(),
    translit: translit.trim(),
    morph: morph.trim(),
    gloss: (gloss || "").trim(),
    def: cleanDef(meaning),
  };
  addKey(id.toLowerCase(), id);
  addKey(id.replace(/^H0+/, "H").toLowerCase(), id); // h530 as well as h0530
  addKey(hebrewKey(lemma), id);
  addKey(latinKey(translit), id);
}

const out = {
  _source: "TBESH — Translators Brief lexicon of Extended Strongs for Hebrew, Tyndale House Cambridge / STEPBible.org, CC BY 4.0. Definitions abridged from Brown-Driver-Briggs.",
  entries,
  index,
};

const dest = path.join(__dirname, "..", "functions", "data", "hebrew-lexicon.json");
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`${Object.keys(entries).length} entries, ${Object.keys(index).length} keys → ${dest}`);
