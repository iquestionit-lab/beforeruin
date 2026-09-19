/**
 * ScriptSearch — Live Source AI Engine
 * Original Frequency Holdings
 *
 * Query → fetch live sources (API.Bible, Sefaria, YLT) → Claude synthesizes → answer
 */

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const Anthropic = require("@anthropic-ai/sdk");

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const APIBIBLE_API_KEY  = defineSecret("APIBIBLE_API_KEY");

// ─── Source Configuration ────────────────────────────────────────────────────
const BIBLES = {
  KJV:  "de4e12af7f28f599-02",
  NASB: "b8ee27bcd1cae43a-01",
  CSB:  "a556c5305ee15c3f-01",
};

// ─── Greek / Hebrew Term Map ──────────────────────────────────────────────────
// Maps transliterated Greek/Hebrew terms to:
//   en  — English search term(s) for Bible text search (what translations actually say)
//   heb — Hebrew cognate for Sefaria search (where relevant)
const TERM_MAP = {
  // Greek NT
  'pistis':       { en: 'faith',              heb: 'emunah' },
  'agape':        { en: 'love',               heb: 'ahavah' },
  'logos':        { en: 'word',               heb: 'dabar' },
  'pneuma':       { en: 'spirit',             heb: 'ruach' },
  'charis':       { en: 'grace',              heb: 'chesed' },
  'sozo':         { en: 'saved',              heb: null },
  'soteria':      { en: 'salvation',          heb: 'yeshuah' },
  'dikaiosyne':   { en: 'righteousness',      heb: 'tsedaqah' },
  'hamartia':     { en: 'sin',                heb: 'chet' },
  'ekklesia':     { en: 'church assembly',    heb: 'qahal' },
  'theos':        { en: 'God',                heb: 'elohim' },
  'kyrios':       { en: 'Lord',               heb: 'adon' },
  'christos':     { en: 'Christ anointed',    heb: 'mashiach' },
  'euangelion':   { en: 'gospel',             heb: 'besorah' },
  'metanoia':     { en: 'repentance',         heb: 'teshuvah' },
  'eirene':       { en: 'peace',              heb: 'shalom' },
  'zoe':          { en: 'life',               heb: 'chayyim' },
  'doxa':         { en: 'glory',              heb: 'kavod' },
  'kairos':       { en: 'time season',        heb: null },
  'ergon':        { en: 'works',              heb: 'maaseh' },
  'nomos':        { en: 'law',                heb: 'torah' },
  'sarx':         { en: 'flesh',              heb: 'basar' },
  'psyche':       { en: 'soul',               heb: 'nephesh' },
  'epithumia':    { en: 'lust desire',        heb: 'taavah' },
  'dunamis':      { en: 'power',              heb: 'koach' },
  'exousia':      { en: 'authority power',    heb: 'mishpat' },
  'telios':       { en: 'perfect complete',   heb: 'shalem' },
  'aion':         { en: 'age world',          heb: 'olam' },
  'cosmos':       { en: 'world',              heb: 'olam' },
  'kosmos':       { en: 'world',              heb: 'olam' },
  'martyria':     { en: 'witness testimony',  heb: 'edah' },
  'parakletos':   { en: 'comforter helper',   heb: null },
  'aletheia':     { en: 'truth',              heb: 'emet' },
  'hamartolos':   { en: 'sinner',             heb: null },
  'baptizo':      { en: 'baptized',           heb: null },
  'rhema':        { en: 'word spoken',        heb: 'dabar' },
  // Hebrew OT
  'emunah':       { en: 'faith faithfulness', heb: 'emunah' },
  'shalom':       { en: 'peace',              heb: 'shalom' },
  'chesed':       { en: 'lovingkindness mercy', heb: 'chesed' },
  'hesed':        { en: 'lovingkindness mercy', heb: 'chesed' },
  'ruach':        { en: 'spirit wind breath', heb: 'ruach' },
  'dabar':        { en: 'word',               heb: 'dabar' },
  'mishpat':      { en: 'justice judgment',   heb: 'mishpat' },
  'tsedaqah':     { en: 'righteousness',      heb: 'tsedaqah' },
  'teshuvah':     { en: 'repentance',         heb: 'teshuvah' },
  'torah':        { en: 'law instruction',    heb: 'torah' },
  'kavod':        { en: 'glory honor',        heb: 'kavod' },
  'elohim':       { en: 'God',                heb: 'elohim' },
  'yahweh':       { en: 'LORD',               heb: 'YHWH' },
  'yhwh':         { en: 'LORD',               heb: 'YHWH' },
  'adonai':       { en: 'Lord',               heb: 'adonai' },
  'mashiach':     { en: 'anointed messiah',   heb: 'mashiach' },
  'nephesh':      { en: 'soul life',          heb: 'nephesh' },
  'basar':        { en: 'flesh',              heb: 'basar' },
  'ahavah':       { en: 'love',               heb: 'ahavah' },
  'emet':         { en: 'truth',              heb: 'emet' },
  'yeshuah':      { en: 'salvation',          heb: 'yeshuah' },
  'berakhah':     { en: 'blessing',           heb: 'berakhah' },
  'qahal':        { en: 'assembly congregation', heb: 'qahal' },
  'olam':         { en: 'forever eternity',   heb: 'olam' },
  'koach':        { en: 'strength power',     heb: 'koach' },
  'shema':        { en: 'hear listen',        heb: 'shema' },
  'malak':        { en: 'angel messenger',    heb: 'malak' },
  'nabi':         { en: 'prophet',            heb: 'nabi' },
  'bereshit':     { en: 'beginning',          heb: 'bereshit' },
};

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are ScriptSearch — a primary-source retrieval engine built by Original Frequency Holdings.

Your function is to tell the user what the original sources actually say about the word or concept they searched. You bring precision and sourcing — but you carry them with clarity, warmth, and the posture of a collaborator, not a corrector. You are a scholar who walks alongside, not one who lectures from a distance.

## What you have access to

You will receive live-fetched source data as context. This may include:
- Multiple Bible translations (KJV, NASB, CSB, YLT) for passage comparison
- Sefaria results: Hebrew Bible text, Talmud, and major commentaries
- Lexical data from research sources

Your answer is built from this fetched data. If a claim is not traceable to the provided sources, you do not make it. Your hermeneutical filters (Rules 8-10) are applied to what the data shows — they do not generate content beyond what was fetched.

When multiple translations are provided, compare them. Where they differ, name the difference plainly and note what the original language would support.

## Rules

Rule 1 — Source only.
Answer from the provided source data. Do not supplement from your training unless it is a direct citation of a named primary source already present in the fetched data. Your interpretive frameworks (Rules 8-10) are lenses on the source material, not independent content sources.

Rule 2 — Cite everything.
Every claim about meaning, usage, or transmission carries a citation. Format: word or phrase (Source, reference). Example: emunah (Strong's H530; Habakkuk 2:4).

Rule 3 — Name drift as drift.
When the fetched sources document a meaning shift across transmission or show differences between translations, state it plainly — which handoff, what changed, when. Do not editorialize as error or conspiracy. State what the record shows.

Rule 4 — Do not interpret beyond the source data.
Restate the attested meaning. Do not extend it, apply it, or draw conclusions the sources do not draw. The exception is Rule 9 (the Character Constraint), which audits renderings against the known persona of Jesus and resolves ambiguity within the data, not beyond it.

Rule 5 — No devotional content.
No pastoral application. No theological conclusions framed as encouragement. No warm-up or warm-close. The sources are the content; your role is to transmit them clearly and humanly.

Rule 6 — Separate source types.
Distinguish between primary sources (scripture, original manuscripts, patristic texts) and research sources (concordances, lexicons, digital reference tools).

Rule 7 — No source data found.
If no source data was fetched for the query, do NOT refuse or return a queue message. Instead:
1. Identify the likely theological term in the query from your knowledge of biblical languages.
2. Answer from your knowledge of attested primary sources — cite them by name, reference, and Strong's number as you would with fetched data.
3. Note at the end: "Source fetch returned no data for this query — answer drawn from lexical knowledge. Cite original sources directly for verification."
Do not invent citations. Do not refuse to answer. A response grounded in named primary sources is always better than a queue message.

Rule 8 — Linguistic Gender & Familial Policy Filter.
Scripture originates within the order of the Divine Family. Every word carries functional gender and familial authority that governs how it must be read. When source data surfaces a term with gender or familial weight, apply this framework:

Word Gender Dynamics:
- Masculine gender carries the persona of initiating force, direction, command, and origin.
- Feminine gender carries the persona of helping, nurturing, sustaining, and bringing forth (e.g., the Spirit / Ruach as Feminine / Ima).

The Familial Order:
- Abba (Father): Pushes, initiates, and establishes sovereign policy.
- Jesus (Son): Guides, points, and transfers the Father's policy. The Son does not establish independent policy, nor act beyond what the Father authorizes.
- Ima (Mother / Spirit): Helps, comforts, and applies the work.

Translation Audit:
When a translated verse contradicts this familial hierarchy, identify it plainly as translation drift. Cite the source and the specific handoff.

Rule 9 — The Character of Jesus (Translation Audit Constraint).
The sinless, non-originating, verbatim-delivering character of Jesus is not a gap-fill applied after translation choices are made. It is an active constraint that precedes them.

Because Jesus cannot sin:
- He cannot have added to the Father's message.
- He cannot have subtracted from it.
- He cannot have originated it.

He transfers what the Father authorizes — exactly, faithfully, without modification. Any rendering that requires a Jesus who originated policy, acted independently of the Father, or authored rather than carried the divine word has introduced drift at the rendering layer, not at the source.

The audit question is not "Does this verse name Jesus?" It is: "Does this rendering require a Jesus who could sin?"

His persona may not appear in every verse. The constraint does not depend on his being named — it depends on his being known. Apply it wherever the source data concerns divine word, agency, authority, or the nature of the messenger.

When a translation diverges from this constraint, name the divergence plainly: what the rendering produces, what the character of Jesus requires, and where the two separate.

Gap-fill function (active where source data leaves genuine ambiguity):
- Sin: Any act resulting in a finite, closed, self-serving end.
- Obedience: Any act producing an ongoing, indefinite collateral effect of life.

Rule 10 — Purpose of the Believer & Ministry.
When source data surfaces references to work, ministry, or calling: believers are instructed to transfer the Good News and remain ready to answer — not to build institutional structures that consume the whole heart and soul. Surface drift from this clearly when the data shows it.

Rule 11 — Faith is Commitment, Not Trust.
When source data concerns faith (emunah / pistis / hypostasis), apply this distinction without exception:

Faith is commitment — the full weight of oneself resting on a declared reality. It is a binding posture, not an ongoing evaluation.

Trust implies revisability: the trusting person retains the option to withdraw confidence if the evidence shifts. Commitment does not. A person who has committed has staked themselves. There is no anxiety in commitment; anxiety lives in trust.

The operative definition is Hebrews 11:1: pistis is hypostasis — the foundation the weight rests upon, not a probability being monitored.

When source material uses "trust" as a gloss for pistis or emunah, name it as a rendering choice and note what the original terms actually carry. Do not reproduce "trust" as the definition. Render faith as commitment to declared reality — sourced from the fetched data.

## Tone

Speak as an accessible scholar and understanding peer. Precise and sourced — but warm, clear, and human. You are sharing what you found, not correcting someone who got it wrong.
- No academic arrogance.
- No lecturing.
- No "great question" openings.
- The response ends when the sourced information ends — but it should feel like a conversation.

## Never name the machinery

The rules above are how you work, not something the reader sees. Never print a rule
number, a rule name, or a phrase like "Rule 11 application" in your answer. Never refer
to "the fetched data", "the provided sources" or "source data" as a category — name the
actual source instead. The reader came for the texts, not for a tour of the apparatus.

Never present a user-created study sheet as a source. If the only thing supporting a
point is a sheet, the point does not go in the answer.

## Response structure

Follow this order when the data supports it:
1. Original term(s) — script, transliteration, language
2. Attested meaning — with primary source citation
3. Translation comparison — where the fetched translations agree or differ, and what the original supports
4. Transmission and drift — each handoff, what changed
5. Primary sources — where to verify directly
6. Research sources — reference tools cited
7. Familial & Behavioral Commentary (only when source data warrants it)

## Search mode behavior

- word_origin: Default. Full structure above. Focus on original language meaning and transmission.
- concept_search: Surface all relevant data. Original term and attested meaning. Familial commentary only if directly relevant.
- passage_search: Multiple translations provided. Compare them. Note agreements and divergences. Apply Rules 8-10 where the passage data supports it.

## Redirect for out-of-scope queries

"ScriptSearch surfaces what the sources say. Here is what the fetched data shows for [term]:" — then proceed with the source data.`;

// ─── Book Code Map ────────────────────────────────────────────────────────────

const BOOK_CODES = {
  'genesis':'GEN','gen':'GEN','ex':'EXO','exodus':'EXO','exo':'EXO',
  'leviticus':'LEV','lev':'LEV','numbers':'NUM','num':'NUM',
  'deuteronomy':'DEU','deu':'DEU','deut':'DEU','dt':'DEU',
  'joshua':'JOS','jos':'JOS','josh':'JOS','judges':'JDG','jdg':'JDG',
  'ruth':'RUT','rut':'RUT',
  '1 samuel':'1SA','1sa':'1SA','1sam':'1SA',
  '2 samuel':'2SA','2sa':'2SA','2sam':'2SA',
  '1 kings':'1KI','1ki':'1KI','2 kings':'2KI','2ki':'2KI',
  '1 chronicles':'1CH','1ch':'1CH','2 chronicles':'2CH','2ch':'2CH',
  'ezra':'EZR','ezr':'EZR','nehemiah':'NEH','neh':'NEH',
  'esther':'EST','est':'EST','job':'JOB',
  'psalms':'PSA','psalm':'PSA','ps':'PSA','psa':'PSA',
  'proverbs':'PRO','prov':'PRO','pro':'PRO',
  'ecclesiastes':'ECC','ecc':'ECC','eccl':'ECC',
  'song of solomon':'SNG','song':'SNG','sos':'SNG','sng':'SNG',
  'isaiah':'ISA','isa':'ISA','jeremiah':'JER','jer':'JER',
  'lamentations':'LAM','lam':'LAM','ezekiel':'EZK','ezek':'EZK','ezk':'EZK',
  'daniel':'DAN','dan':'DAN','hosea':'HOS','hos':'HOS',
  'joel':'JOL','jol':'JOL','amos':'AMO','amo':'AMO',
  'obadiah':'OBA','oba':'OBA','jonah':'JON','jon':'JON',
  'micah':'MIC','mic':'MIC','nahum':'NAM','nam':'NAM',
  'habakkuk':'HAB','hab':'HAB','zephaniah':'ZEP','zep':'ZEP',
  'haggai':'HAG','hag':'HAG','zechariah':'ZEC','zec':'ZEC','zech':'ZEC',
  'malachi':'MAL','mal':'MAL',
  'matthew':'MAT','mat':'MAT','matt':'MAT',
  'mark':'MRK','mrk':'MRK','mk':'MRK',
  'luke':'LUK','luk':'LUK','lk':'LUK',
  'john':'JHN','jhn':'JHN','jn':'JHN',
  'acts':'ACT','act':'ACT',
  'romans':'ROM','rom':'ROM',
  '1 corinthians':'1CO','1co':'1CO','1cor':'1CO',
  '2 corinthians':'2CO','2co':'2CO','2cor':'2CO',
  'galatians':'GAL','gal':'GAL','ephesians':'EPH','eph':'EPH',
  'philippians':'PHP','php':'PHP','phil':'PHP',
  'colossians':'COL','col':'COL',
  '1 thessalonians':'1TH','1th':'1TH','1thess':'1TH',
  '2 thessalonians':'2TH','2th':'2TH',
  '1 timothy':'1TI','1ti':'1TI','1tim':'1TI',
  '2 timothy':'2TI','2ti':'2TI',
  'titus':'TIT','tit':'TIT','philemon':'PHM','phm':'PHM',
  'hebrews':'HEB','heb':'HEB','james':'JAS','jas':'JAS',
  '1 peter':'1PE','1pe':'1PE','1pet':'1PE',
  '2 peter':'2PE','2pe':'2PE',
  '1 john':'1JN','1jn':'1JN','2 john':'2JN','2jn':'2JN',
  '3 john':'3JN','3jn':'3JN',
  'jude':'JUD','jud':'JUD','revelation':'REV','rev':'REV',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function safeFetch(url, options = {}, label = '') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return res;
  } catch (e) {
    clearTimeout(timer);
    console.warn(`Fetch failed [${label}]:`, e.message);
    return null;
  }
}

function parsePassageRef(query) {
  const q = query.trim();
  // Match: Book Chapter:Verse or Book Chapter.Verse (with optional verse range)
  const match = q.match(/^((?:\d\s)?[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(\d+)[:\.](\d+)(?:\s*[-]\s*(\d+))?$/i);
  if (!match) return null;
  const bookRaw = match[1].toLowerCase().trim();
  const chapter = match[2];
  const verseStart = match[3];
  const verseEnd = match[4];
  const code = BOOK_CODES[bookRaw];
  if (!code) return null;
  return verseEnd
    ? `${code}.${chapter}.${verseStart}-${code}.${chapter}.${verseEnd}`
    : `${code}.${chapter}.${verseStart}`;
}

// ─── Source Fetchers ──────────────────────────────────────────────────────────

async function fetchApiBible(bibleId, passageId, label) {
  const url = `https://api.scripture.api.bible/v1/bibles/${bibleId}/passages/${passageId}?content-type=text&include-notes=false&include-titles=false&include-chapter-numbers=false&include-verse-numbers=true`;
  const res = await safeFetch(url, { headers: { 'api-key': APIBIBLE_API_KEY.value() } }, label);
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    const text = data.data?.content?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return text ? `${label}:\n${text}` : null;
  } catch (e) { return null; }
}

async function fetchYLT(reference) {
  // bible-api.com takes a plain reference ("John 1:3"). YLT there is New Testament only;
  // an Old Testament lookup simply returns nothing, which the caller already handles.
  const url = `https://bible-api.com/${encodeURIComponent(reference)}?translation=ylt`;
  const res = await safeFetch(url, {}, 'YLT');
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    const text = (data.text || '').replace(/\s+/g, ' ').trim();
    return text
      ? `Young's Literal Translation (YLT):\n[${data.reference || reference}] ${text}`
      : null;
  } catch (e) { return null; }
}

async function fetchSefaria(query) {
  const SEARCH_URL = 'https://www.sefaria.org/api/search-wrapper';
  const post = (body, label) => safeFetch(SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }, label);

  const [textRes, sheetRes] = await Promise.all([
    post({ query, type: 'text',  field: 'naive_lemmatizer', sort_type: 'relevance', size: 5 }, 'Sefaria-text'),
    post({ query, type: 'sheet', field: 'content',          sort_type: 'relevance', size: 3 }, 'Sefaria-sheets'),
  ]);

  const parts = [];

  if (textRes && textRes.ok) {
    try {
      const data = await textRes.json();
      const hits = (data.hits?.hits || []).slice(0, 5).map(h => {
        // search-wrapper returns no _source: the reference is the _id, the text is in highlight
        const ref = String(h._id || '').split(' (')[0];
        const hl  = h.highlight || {};
        const text = []
          .concat(hl.naive_lemmatizer || [], hl.exact || [], hl.content || [])
          .join(' … ')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        return text ? `[${ref}] ${text.slice(0, 350)}` : null;
      }).filter(Boolean);
      if (hits.length) parts.push(`Sefaria — Hebrew/Jewish primary texts:\n${hits.join('\n\n')}`);
    } catch (e) {}
  }

  if (sheetRes && sheetRes.ok) {
    try {
      const data = await sheetRes.json();
      const hits = (data.hits?.hits || []).slice(0, 3).map(h => {
        // Sheet _ids are numeric and unciteable; a bare number is worse than no label
        const rawId = String(h._id || '').split(' (')[0];
        const title = /^\d+$/.test(rawId.trim()) ? '' : rawId;
        const hl = h.highlight || {};
        const content = []
          .concat(hl.content || [], hl.naive_lemmatizer || [])
          .join(' … ')
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const snippet = content.slice(0, 300);
        return snippet ? `[Commentary${title ? ': ' + title : ''}] ${snippet}` : null;
      }).filter(Boolean);
      if (hits.length) parts.push(
        'Sefaria — USER-CREATED STUDY SHEETS. These are not primary sources and not ' +
        'citable. They are private study notes uploaded by members of the public. ' +
        'Use them only as a hint about where to look; never quote them, never list ' +
        'them as a source, never attribute a claim to them.\n' + hits.join('\n\n'));
    } catch (e) {}
  }

  return parts.length ? parts.join('\n\n') : null;
}

async function fetchSefariaPassage(reference) {
  // Try direct Sefaria text lookup for OT passages
  const url = `https://www.sefaria.org/api/texts/${encodeURIComponent(reference)}?commentary=0&context=0`;
  const res = await safeFetch(url, {}, 'Sefaria-passage');
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    const parts = [];
    if (data.he) {
      const hebrew = Array.isArray(data.he) ? data.he.join(' ') : data.he;
      if (hebrew) parts.push(`Hebrew text: ${hebrew.replace(/<[^>]+>/g, '').trim()}`);
    }
    if (data.text) {
      const english = Array.isArray(data.text) ? data.text.join(' ') : data.text;
      if (english) parts.push(`Sefaria English: ${english.replace(/<[^>]+>/g, '').trim()}`);
    }
    return parts.length ? `Sefaria [${reference}]:\n${parts.join('\n')}` : null;
  } catch (e) { return null; }
}

async function fetchApiBibleSearch(bibleId, label, query, limit = 5) {
  const url = `https://api.scripture.api.bible/v1/bibles/${bibleId}/search?query=${encodeURIComponent(query)}&limit=${limit}&sort=relevance`;
  const res = await safeFetch(url, { headers: { 'api-key': APIBIBLE_API_KEY.value() } }, `${label}-search`);
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    const verses = (data.data?.verses || []).slice(0, limit);
    if (!verses.length) return null;
    const lines = verses.map(v => {
      const txt = (v.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return txt ? `[${v.reference}] ${txt}` : null;
    }).filter(Boolean);
    return lines.length ? `${label} — verses containing "${query}":\n${lines.join('\n')}` : null;
  } catch (e) { return null; }
}

async function fetchSefariaLexicon(word) {
  // Sefaria's word API returns Strong's Greek/Hebrew lexicon entries
  const url = `https://www.sefaria.org/api/words/${encodeURIComponent(word)}?always_consonants=0&never_split=0`;
  const res = await safeFetch(url, {}, 'Sefaria-lexicon');
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    const entries = Array.isArray(data) ? data : [data];
    const lines = entries.slice(0, 4).map(entry => {
      const headword = entry.headWord || entry.head_word || entry.word || word;
      const lexicon  = entry.parent_lexicon || entry.lexicon || '';
      const morphs   = Array.isArray(entry.morphs) ? entry.morphs : [];
      const defs = morphs.flatMap(m =>
        (m.senses || []).map(s => {
          const def = s.definition || s.glosses?.join('; ') || '';
          return def ? `  • ${def}` : null;
        }).filter(Boolean)
      );
      // Fallback: top-level senses
      const topDefs = (entry.senses || []).map(s => {
        const def = s.definition || s.glosses?.join('; ') || '';
        return def ? `  • ${def}` : null;
      }).filter(Boolean);
      const allDefs = defs.length ? defs : topDefs;
      if (!allDefs.length) return null;
      return `${headword}${lexicon ? ' (' + lexicon + ')' : ''}:\n${allDefs.join('\n')}`;
    }).filter(Boolean);
    return lines.length
      ? `Sefaria Lexicon — "${word}":\n${lines.join('\n\n')}`
      : null;
  } catch (e) { return null; }
}

// ─── Main Source Aggregator ───────────────────────────────────────────────────

async function fetchLiveSources(query, mode) {
  const sources = [];

  if (mode === 'passage_search') {
    const passageId = parsePassageRef(query);
    if (passageId) {
      // Parallel fetch: 3 API.Bible translations + YLT + Sefaria
      const [kjv, nasb, csb, ylt, sefaria] = await Promise.all([
        fetchApiBible(BIBLES.KJV,  passageId, 'King James Version (KJV)'),
        fetchApiBible(BIBLES.NASB, passageId, 'New American Standard Bible 1995 (NASB)'),
        fetchApiBible(BIBLES.CSB,  passageId, 'Christian Standard Bible (CSB)'),
        fetchYLT(query),
        fetchSefariaPassage(query),
      ]);
      if (kjv)    sources.push(kjv);
      if (nasb)   sources.push(nasb);
      if (csb)    sources.push(csb);
      if (ylt)    sources.push(ylt);
      if (sefaria) sources.push(sefaria);
    }
    // If passage parse failed or nothing returned, fall through to Sefaria search
    if (sources.length === 0) {
      const fallback = await fetchSefaria(query);
      if (fallback) sources.push(fallback);
    }

  } else {
    // word_origin or concept_search
    const STOP_WORDS = new Set([
      // Grammar
      'is','are','was','were','do','does','did','has','have','had',
      'what','who','where','when','why','how','which','whose',
      'the','a','an','and','or','of','in','on','at','to','for',
      'can','could','would','should','will','shall','may','might',
      'i','you','he','she','it','we','they','me','him','her','us','them',
      'my','your','his','its','our','their','this','that','these','those',
      // Question-framing words (not the theological subject)
      'choose','pick','find','show','give','tell','list','explain','define',
      'look','search','get','use','used','mean','means','meaning','definition',
      'two','one','three','four','five','few','some','any','many','several',
      'word','words','term','terms','concept','place','places','instance',
      'instances','example','examples','time','times','verse','verses',
      'passage','passages','text','texts','reference','references',
      // Biblical context words (not the subject being searched)
      'new','old','testament','bible','scripture','scriptures','biblical',
      'greek','hebrew','latin','english','original','language','translation',
      'say','says','said','speak','spoken','written','write','appears',
      'appear','found','book','books','chapter','chapters',
    ]);

    const searchTerms = query
      .toLowerCase()
      .replace(/[?.,!;:'"]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));

    // Raw extracted query (e.g. "pistis" from "what is pistis")
    const rawQuery = searchTerms.slice(0, 2).join(' ') || query.trim().toLowerCase();

    // Check if the primary term is a mapped Greek/Hebrew word
    const primaryTerm = searchTerms[0] || query.trim().toLowerCase();
    const termEntry = TERM_MAP[primaryTerm];

    // Bible text search uses the English equivalent if the term is Greek/Hebrew
    const bibleSearchQuery = termEntry ? termEntry.en : rawQuery;

    // Sefaria search uses the Hebrew cognate (if available) or the raw query
    const sefariaSearchQuery = (termEntry && termEntry.heb) ? termEntry.heb : rawQuery;

    console.log(`[ScriptSearch] raw="${rawQuery}" → bible="${bibleSearchQuery}" sefaria="${sefariaSearchQuery}" mapped=${!!termEntry}`);

    // Parallel: Sefaria lexicon + Sefaria text search + API.Bible text search
    const [lexicon, sefaria, kjvSearch, nasbSearch, csbSearch] = await Promise.all([
      termEntry ? fetchSefariaLexicon(termEntry.heb || primaryTerm) : Promise.resolve(null),
      fetchSefaria(sefariaSearchQuery),
      fetchApiBibleSearch(BIBLES.KJV,  'King James Version (KJV)',                bibleSearchQuery, 8),
      fetchApiBibleSearch(BIBLES.NASB, 'New American Standard Bible 1995 (NASB)', bibleSearchQuery, 8),
      fetchApiBibleSearch(BIBLES.CSB,  'Christian Standard Bible (CSB)',          bibleSearchQuery, 8),
    ]);
    if (lexicon)    sources.push(lexicon);
    if (sefaria)    sources.push(sefaria);
    if (kjvSearch)  sources.push(kjvSearch);
    if (nasbSearch) sources.push(nasbSearch);
    if (csbSearch)  sources.push(csbSearch);

    // Secondary individual-term passes for multi-word queries
    if (searchTerms.length >= 2) {
      const secondaryTerms = searchTerms.slice(0, 2).map(t => {
        const e = TERM_MAP[t];
        return e ? e.en : t;
      });
      const secondaryResults = await Promise.all(
        secondaryTerms.map((term, i) =>
          fetchApiBibleSearch(BIBLES.KJV, `KJV — "${searchTerms[i]}" context`, term, 5)
        )
      );
      secondaryResults.forEach(r => { if (r) sources.push(r); });
    }
  }

  return sources.length > 0 ? sources.join('\n\n' + '─'.repeat(40) + '\n\n') : null;
}

// ─── Cloud Function ───────────────────────────────────────────────────────────

exports.search = onRequest(
  {
    secrets: [ANTHROPIC_API_KEY, APIBIBLE_API_KEY],
    region: "us-central1",
    timeoutSeconds: 60,
  },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed. Use POST." });

    const { q, mode = "word_origin" } = req.body;
    if (!q || typeof q !== "string" || q.trim().length === 0)
      return res.status(400).json({ error: "Query parameter 'q' is required." });

    const validModes = ["word_origin", "concept_search", "passage_search"];
    if (!validModes.includes(mode))
      return res.status(400).json({ error: "Invalid mode." });

    // Fetch live sources
    const sourceData = await fetchLiveSources(q.trim(), mode);

    const userMessage = sourceData
      ? `Query: "${q.trim()}"\nMode: ${mode}\n\nLive source data retrieved:\n\n${sourceData}`
      : `Query: "${q.trim()}"\nMode: ${mode}\n\nNo source data was retrieved from external sources for this query.`;

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      });

      return res.status(200).json({
        query: q.trim(),
        mode,
        answer: message.content[0].text,
        sources_fetched: sourceData ? true : false,
      });
    } catch (err) {
      console.error("Anthropic API error:", err);
      return res.status(500).json({
        error: "Search engine error. Please try again.",
        _debug_message: err.message || String(err),
      });
    }
  }
);
