// Counting and reading-time estimates. See requirements 2.1.

const SPEED = {
  cjkPerMinute: 400,
  wordsPerMinute: 150
}

const CJK = /[㐀-䶿一-鿿豈-﫿]/g
const WORD = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g

function countMatches(text, re) {
  re.lastIndex = 0
  let n = 0
  while (re.exec(text) !== null) n++
  return n
}

/** CJK characters and Latin words are counted separately. */
function countUnits(text) {
  return { cjk: countMatches(text, CJK), words: countMatches(text, WORD) }
}

/** Estimated reading minutes for given unit counts. */
function readingMinutes(stats) {
  return stats.cjk / SPEED.cjkPerMinute + stats.words / SPEED.wordsPerMinute
}

/** Human-readable size, e.g. "约 5.1 万字" or "约 12,000 词". */
function formatAmount(stats, language) {
  if (language === 'en') return '约 ' + String(stats.words).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 词'
  const n = stats.cjk
  return n >= 10000 ? '约 ' + (n / 10000).toFixed(1) + ' 万字' : '约 ' + n + ' 字'
}

module.exports = { SPEED, countUnits, readingMinutes, formatAmount }
