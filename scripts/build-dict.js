// Builds the offline dictionary from ECDICT (https://github.com/skywind3000/ECDICT, MIT).
// Usage: node scripts/build-dict.js path/to/ecdict.csv
// Writes miniprogram/dict1..3/data.js. See miniprogram/utils/dict.js for the format.
const fs = require('fs')
const path = require('path')
const { parsePart, lookup, DICT_PARTS } = require('../miniprogram/utils/dict')

const RANK_LIMIT = 60000 // keep words within the 60,000 most frequent (COCA or BNC)
// Words a CET-6 reader is assumed to know: exam word lists, or the most frequent ones.
// Everything else is marked rare and gets a light underline in the reader.
const COMMON_TAGS = ['zk', 'gk', 'cet4', 'cet6']
const COMMON_RANK = 8000
const MAX_DEFS = 3
const MAX_DEF_CHARS = 40
const PART_LIMIT = 1.9 * 1024 * 1024 // subpackages must stay under 2 MB
const OUT = path.join(__dirname, '..', 'miniprogram')

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const head = rows.shift()
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] || ''])))
}

const isSimple = (w) => /^[a-z][a-z'-]*$/.test(w)

function isCommon(r) {
  if (!r) return false
  const frq = Number(r.frq) || 0
  const bnc = Number(r.bnc) || 0
  return r.tag.split(' ').some((t) => COMMON_TAGS.includes(t)) || (frq > 0 && frq <= COMMON_RANK) || (bnc > 0 && bnc <= COMMON_RANK)
}

/** Rare unless the word or its base form is common (was -> be, glistened -> glisten). */
function isRare(r, byWord, candidates) {
  const base = /(?:^|\/)0:([a-z][a-z'-]*)/.exec(r.exchange)
  const lemma = candidates.get(r.word)
  return !isCommon(r) && !(base && isCommon(byWord.get(base[1]))) && !(lemma && isCommon(byWord.get(lemma[0])))
}

function keep(r) {
  const frq = Number(r.frq) || 0
  const bnc = Number(r.bnc) || 0
  return (frq > 0 && frq <= RANK_LIMIT) || (bnc > 0 && bnc <= RANK_LIMIT) || r.tag || r.oxford === '1' || (Number(r.collins) || 0) > 0
}

/** "n. 银行, 堤, 岸\n[医] 库" -> ["n. 银行, 堤, 岸"] */
function definitions(translation) {
  const lines = translation.replace(/\\r/g, '').split('\\n').map((l) => l.trim()).filter(Boolean)
  const general = lines.filter((l) => !l.startsWith('['))
  return (general.length ? general : lines.map((l) => l.replace(/^\[[^\]]*\]\s*/, '')))
    .slice(0, MAX_DEFS)
    .map(shorten)
    .filter(Boolean)
}

function shorten(line) {
  line = line.replace(/[|\t]/g, ' ')
  if (line.length <= MAX_DEF_CHARS) return line
  const cut = line.slice(0, MAX_DEF_CHARS)
  const at = Math.max(cut.lastIndexOf(','), cut.lastIndexOf('，'), cut.lastIndexOf('；'), cut.lastIndexOf(';'))
  return (at > 10 ? cut.slice(0, at) : cut) + '…'
}

// ECDICT's older entries use stand-ins: "\\\\" for ɜ, "^" for ʌ, Cyrillic ә/є.
const cleanPhonetic = (p) =>
  p.replace(/\\+/g, 'ɜ').replace(/\^/g, 'ʌ').replace(/ә/g, 'ə').replace(/[єε]/g, 'ɛ').replace(/\u00a0/g, ' ').replace(/[\t|\n]/g, '').trim()

function build(csvPath) {
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'))
  const byWord = new Map(rows.map((r) => [r.word, r]))
  const words = new Map()
  rows.forEach((r) => {
    if (!isSimple(r.word) || !keep(r)) return
    const defs = definitions(r.translation)
    if (defs.length) words.set(r.word, { phonetic: cleanPhonetic(r.phonetic), defs })
  })

  // Inflected forms -> lemma, from the lemma's exchange field and the form's "0:" field.
  const candidates = new Map()
  words.forEach((_, w) => {
    const ex = byWord.get(w).exchange
    ex.split('/').forEach((pair) => {
      const [type, form] = pair.split(':')
      if (!form || !'pdi3srt'.includes(type) || !isSimple(form) || form === w) return
      const prev = candidates.get(form)
      if (!prev) candidates.set(form, [w, type])
      else if (prev[0] === w && !prev[1].includes(type)) prev[1] += type // e.g. "pd": past tense and past participle
    })
  })
  rows.forEach((r) => {
    const m = /(?:^|\/)0:([a-z][a-z'-]*)/.exec(r.exchange)
    const t = /(?:^|\/)1:([a-z0-9]+)/.exec(r.exchange)
    if (m && isSimple(r.word) && words.has(m[1]) && !candidates.has(r.word)) candidates.set(r.word, [m[1], t ? t[1][0] : ''])
  })
  words.forEach((e, w) => { e.rare = isRare(byWord.get(w), byWord, candidates) })

  // Keep forms the stemming rules get wrong, and forms that are words of their
  // own unless the definition already names the base word ("think的过去式").
  const wordLines = [...words].map(([w, e]) => w + '\t' + e.phonetic + '\t' + e.defs.join('|') + (e.rare ? '\t1' : ''))
  const plain = parsePart({ words: wordLines.join('\n'), forms: '' })
  const forms = [...candidates].filter(([form, [lemma]]) => {
    if (words.has(form)) return !words.get(form).defs.join(' ').includes(lemma)
    const hit = lookup(plain, form)
    return !hit || hit.word !== lemma
  })

  // Split into parts of similar size.
  const parts = Array.from({ length: DICT_PARTS }, () => ({ words: [], forms: [] }))
  const total = wordLines.join('\n').length
  let size = 0
  wordLines.forEach((l) => {
    const i = Math.min(DICT_PARTS - 1, Math.floor((size / total) * DICT_PARTS))
    parts[i].words.push(l)
    size += l.length + 1
  })
  forms.forEach(([f, [l, type]], i) => parts[i % DICT_PARTS].forms.push(f + '\t' + l + '\t' + type))

  parts.forEach((p, i) => {
    const dir = path.join(OUT, 'dict' + (i + 1))
    fs.mkdirSync(dir, { recursive: true })
    const js =
      '// Generated by scripts/build-dict.js from ECDICT (MIT, https://github.com/skywind3000/ECDICT). Do not edit.\n' +
      'module.exports = ' + JSON.stringify({ words: p.words.join('\n'), forms: p.forms.join('\n') }) + '\n'
    const bytes = Buffer.byteLength(js)
    if (bytes > PART_LIMIT) throw new Error('dict' + (i + 1) + ' is too large: ' + bytes)
    fs.writeFileSync(path.join(dir, 'data.js'), js)
    console.log('dict' + (i + 1), p.words.length, 'words', p.forms.length, 'forms', (bytes / 1024 / 1024).toFixed(2) + ' MB')
  })
  console.log('total', words.size, 'words,', [...words.values()].filter((e) => e.rare).length, 'rare,', forms.length, 'irregular forms')
}

build(process.argv[2])
