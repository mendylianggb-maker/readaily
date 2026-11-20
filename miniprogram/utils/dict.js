// Offline English-Chinese dictionary for tap-to-look-up in English books.
// See requirements 3.6. Data comes from ECDICT (MIT), built by scripts/build-dict.js
// into subpackages dict1, dict2, ... (each under the 2 MB subpackage limit).
//
// Each part exports { words, forms }:
//   words: "word\tphonetic\tdef1|def2[\t1]\n..."  (definitions joined by "|"; 1 = rare)
//   forms: "went\tgo\tp\n..."                (form, lemma, type: see FORM_TYPES)
// Forms are listed when the stemming rules below would miss them (went, mice),
// or when the form is a word of its own (saw = a tool, and the past of see).

const DICT_PARTS = 3
const FORM_TYPES = { p: '过去式', d: '过去分词', i: '现在分词', 3: '第三人称单数', s: '复数', r: '比较级', t: '最高级' }

// A word: letters with inner apostrophes or hyphens ("don't", "well-known").
const WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*/g

/**
 * Split a paragraph into tokens for tapping. Each token is a word (w: true)
 * or the text between words. Joining every `t` gives back the paragraph.
 */
function tokenize(text) {
  const out = []
  let last = 0
  WORD.lastIndex = 0
  let m
  while ((m = WORD.exec(text))) {
    if (m.index > last) out.push({ t: text.slice(last, m.index) })
    out.push({ t: m[0], w: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last) })
  return out
}

/** Parse one data part into maps. */
function parsePart(part, into) {
  const dict = into || { words: new Map(), forms: new Map() }
  part.words.split('\n').forEach((line) => {
    if (!line) return
    const [word, phonetic, defs, rare] = line.split('\t')
    dict.words.set(word, { phonetic, defs: defs ? defs.split('|') : [], rare: rare === '1' })
  })
  part.forms.split('\n').forEach((line) => {
    if (!line) return
    const [form, lemma, type] = line.split('\t')
    dict.forms.set(form, { lemma, type: type || '' })
  })
  return dict
}

const CONSONANT = /[bcdfghjklmnpqrstvwxz]/

/**
 * Possible dictionary forms of an inflected word, most likely first.
 * Covers regular plurals, past tenses, -ing, comparatives; irregular forms
 * (went, mice) come from the dictionary's `forms` list instead.
 */
function stems(w) {
  const out = []
  const add = (s) => { if (s && s.length > 1 && out.indexOf(s) === -1) out.push(s) }
  const undouble = (s) => (s.length > 2 && s[s.length - 1] === s[s.length - 2] && CONSONANT.test(s[s.length - 1]) ? s.slice(0, -1) : '')
  if (/ies$/.test(w)) add(w.slice(0, -3) + 'y')
  if (/(s|x|z|ch|sh|o)es$/.test(w)) add(w.slice(0, -2))
  if (/s$/.test(w) && !/ss$/.test(w)) add(w.slice(0, -1))
  if (/ied$/.test(w)) add(w.slice(0, -3) + 'y')
  if (/ed$/.test(w)) {
    const s = w.slice(0, -2)
    add(s); add(s + 'e'); add(undouble(s))
  }
  if (/ing$/.test(w)) {
    const s = w.slice(0, -3)
    add(s); add(s + 'e'); add(undouble(s))
    if (/y$/.test(s)) add(s.slice(0, -1) + 'ie') // lying -> lie
  }
  if (/ier$/.test(w)) add(w.slice(0, -3) + 'y')
  if (/iest$/.test(w)) add(w.slice(0, -4) + 'y')
  if (/er$/.test(w)) {
    const s = w.slice(0, -2)
    add(s); add(s + 'e'); add(undouble(s))
  }
  if (/est$/.test(w)) {
    const s = w.slice(0, -3)
    add(s); add(s + 'e'); add(undouble(s))
  }
  if (/ily$/.test(w)) add(w.slice(0, -3) + 'y')
  if (/ly$/.test(w)) add(w.slice(0, -2))
  return out
}

/** Clean a tapped word: curly apostrophes, possessives, case. */
function normalize(raw) {
  let w = raw.replace(/’/g, "'")
  w = w.replace(/'s$/i, '').replace(/'$/, '')
  return w
}

/**
 * Look a tapped word up. Returns { word, phonetic, defs, from, also } or null.
 * `word` is the entry found (e.g. "go" for "went"); `from` is the tapped word
 * when it differs; `also` is { word, kind } when the entry is itself a form of
 * another word (saw -> also the past tense of see).
 */
function lookup(dict, raw) {
  const tapped = normalize(raw)
  const tries = [tapped, tapped.toLowerCase()]
  // Hyphenated words: the whole word first, then each part.
  if (tapped.indexOf('-') !== -1) tapped.toLowerCase().split('-').forEach((p) => tries.push(p))
  for (const w of tries) {
    const hit = find(dict, w)
    if (hit) return Object.assign({ from: hit.word.toLowerCase() === raw.toLowerCase() ? '' : raw }, hit)
  }
  return null
}

/** "pd" -> "过去式和过去分词" */
function formKind(type) {
  const names = 'pdi3srt'.split('').filter((t) => type.includes(t)).map((t) => FORM_TYPES[t])
  return names.length ? names.join('和') : '变形'
}

function find(dict, w) {
  const entry = (x) => Object.assign({ word: x, also: null }, dict.words.get(x))
  const form = dict.forms.get(w)
  if (dict.words.has(w)) {
    const hit = entry(w)
    if (form && dict.words.has(form.lemma)) hit.also = { word: form.lemma, kind: formKind(form.type) }
    return hit
  }
  if (form && dict.words.has(form.lemma)) return entry(form.lemma)
  for (const s of stems(w)) if (dict.words.has(s)) return entry(s)
  return null
}

const ABBREVIATIONS = /^(Mr|Mrs|Ms|Dr|St|Mt|Jr|Sr|Prof|Capt|Col|Gen|Lt|Rev|No|vs|etc)$/

/**
 * Whether a word in running text should be marked as rare (beyond CET-6).
 * Capitalized words are skipped unless they start a sentence: they are
 * usually names, which the dictionary may list as ordinary words (Bennet).
 */
function isRareWord(dict, raw, startsSentence) {
  if (/^[A-Z]/.test(raw) && !startsSentence) return false
  const hit = lookup(dict, raw)
  if (!hit || !hit.rare) return false
  const base = hit.also && dict.words.get(hit.also.word)
  if (base && !base.rare) return false
  // impatiently -> impatient: a common base form makes it common too.
  return !stems(normalize(raw).toLowerCase()).some((x) => dict.words.has(x) && !dict.words.get(x).rare)
}

/**
 * Mark rare words in tokenized paragraphs. Returns setData paths, e.g.
 * { "blocks[3].tokens[17].r": 1 }, so only those tokens re-render.
 */
function rarePaths(dict, blocks) {
  const paths = {}
  blocks.forEach((b, bi) => {
    if (!b.tokens) return
    let sentenceStart = true
    b.tokens.forEach((tk, ti) => {
      if (tk.w) {
        if (isRareWord(dict, tk.t, sentenceStart)) paths['blocks[' + bi + '].tokens[' + ti + '].r'] = 1
        sentenceStart = false
      } else if (/[.!?]["”’)]*\s*["“‘(]?\s*$|^\s*["“‘(]\s*$/.test(tk.t)) {
        const prev = ti > 0 ? b.tokens[ti - 1].t : ''
        sentenceStart = !(tk.t.trim() === '.' && ABBREVIATIONS.test(prev)) // "Mr. Bennet" is not a new sentence
      }
    })
  })
  return paths
}

// --- Loading in the mini program (data lives in subpackages) ---

let loaded = null

function loadParts() {
  // Paths must be literal for the compiler to find the subpackages.
  return Promise.all([
    require.async('../dict1/data.js'),
    require.async('../dict2/data.js'),
    require.async('../dict3/data.js')
  ])
}

/** Load the whole dictionary once. Resolves to { words, forms }. */
function loadDict() {
  if (!loaded) {
    loaded = loadParts().then((parts) => {
      const dict = { words: new Map(), forms: new Map() }
      parts.forEach((p) => parsePart(p, dict))
      return dict
    })
    loaded.catch(() => { loaded = null }) // allow a retry, e.g. after a network error
  }
  return loaded
}

module.exports = { DICT_PARTS, FORM_TYPES, tokenize, isRareWord, rarePaths, parsePart, stems, normalize, lookup, loadDict }
