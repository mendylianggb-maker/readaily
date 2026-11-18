// Split a book into daily sessions. See requirements 2.2.
//
// Rules, with T = target minutes per session:
// - Prefer cutting at chapter ends when the session is within 70%-130% of T.
// - Short chapters (< 70% of T) continue into the next chapter.
// - Long chapters are cut at the paragraph boundary closest to T.
// - Never leave a chapter tail under 30% of T on its own day.
// - Paragraphs longer than 2T are cut at sentence ends.
// - The last session of the book is merged into the previous one if under 30% of T.

const { countUnits, readingMinutes } = require('./text-stats')

const LOW = 0.7
const HIGH = 1.3
const TAIL = 0.3
const LONG_PARAGRAPH = 2
const SENTENCE = /[^。！？.!?\n]*[。！？.!?]+["”’'」』）)]*|[^。！？.!?\n]+$/g

function minutesOf(s) {
  return readingMinutes(countUnits(s))
}

/** Reading units (paragraphs, or sentences of very long paragraphs) of one chapter range. */
function unitsOf(text, from, to, target) {
  const units = []
  let pos = from
  while (pos < to) {
    let nl = text.indexOf('\n', pos)
    if (nl === -1 || nl > to) nl = to
    const line = text.slice(pos, nl)
    if (line.trim()) {
      const minutes = minutesOf(line)
      if (minutes > target * LONG_PARAGRAPH) {
        SENTENCE.lastIndex = 0
        let m
        while ((m = SENTENCE.exec(line)) !== null) {
          if (!m[0]) { SENTENCE.lastIndex++; continue }
          const start = pos + m.index
          units.push({ start, end: start + m[0].length, minutes: minutesOf(m[0]) })
        }
        // The newline belongs to the last sentence.
        if (units.length) units[units.length - 1].end = Math.min(nl + 1, to)
      } else {
        units.push({ start: pos, end: Math.min(nl + 1, to), minutes })
      }
    }
    pos = nl + 1
  }
  return units
}

/**
 * @param {string} text
 * @param {{ title: string, start: number, end: number }[]} chapters
 * @param {number} target minutes per session
 * @param {number} [fromOffset] only split text after this offset (for re-splitting)
 * @returns {{ start: number, end: number, label: string }[]}
 */
function splitBook(text, chapters, target, fromOffset = 0) {
  const sessions = [] // { start, end, minutes, chapters: Set }
  let cur = null

  const cut = () => {
    if (cur && cur.minutes > 0) sessions.push(cur)
    cur = null
  }

  chapters.forEach((ch, ci) => {
    if (ch.end <= fromOffset) return
    const units = unitsOf(text, Math.max(ch.start, fromOffset), ch.end, target)
    // Minutes remaining in this chapter from unit k (inclusive).
    const rest = new Array(units.length + 1).fill(0)
    for (let k = units.length - 1; k >= 0; k--) rest[k] = rest[k + 1] + units[k].minutes

    units.forEach((u, k) => {
      if (cur && cur.minutes + u.minutes > target) {
        const finishesChapter = cur.minutes + rest[k] <= target * HIGH
        const cutIsCloser = Math.abs(cur.minutes - target) <= Math.abs(cur.minutes + u.minutes - target)
        if (!finishesChapter && cutIsCloser) cut()
      }
      if (!cur) cur = { start: u.start, end: u.end, minutes: 0, chapters: [] }
      cur.end = u.end
      cur.minutes += u.minutes
      if (cur.chapters[cur.chapters.length - 1] !== ci) cur.chapters.push(ci)
    })

    if (cur && cur.minutes >= target * LOW) cut()
  })

  if (cur) {
    const last = sessions[sessions.length - 1]
    if (last && cur.minutes < target * TAIL) {
      last.end = cur.end
      last.minutes += cur.minutes
      cur.chapters.forEach((c) => { if (last.chapters.indexOf(c) === -1) last.chapters.push(c) })
    } else {
      sessions.push(cur)
    }
  }

  // A chapter that started before fromOffset is a continuation.
  const continued = chapters.findIndex((ch) => ch.start < fromOffset && ch.end > fromOffset)
  return labelSessions(sessions, chapters, continued)
}

// "第三章" / "第三章 (2/3)" / "第五章 ～ 第六章" / "第三章（续）"
function labelSessions(sessions, chapters, continued) {
  const parts = {} // chapter index -> number of sessions it appears in
  sessions.forEach((s) => s.chapters.forEach((c) => { parts[c] = (parts[c] || 0) + 1 }))
  const seen = {}
  return sessions.map((s) => {
    s.chapters.forEach((c) => { seen[c] = (seen[c] || 0) + 1 })
    const first = s.chapters[0]
    const last = s.chapters[s.chapters.length - 1]
    const name = (c) => chapters[c].title + (c === continued ? '（续）' : '')
    let label
    if (chapters.length <= 1) label = ''
    else if (first !== last) label = name(first) + ' ～ ' + name(last)
    else if (parts[first] > 1 && first !== continued) label = name(first) + ' (' + seen[first] + '/' + parts[first] + ')'
    else label = name(first)
    return { start: s.start, end: s.end, label }
  })
}

module.exports = { splitBook }
