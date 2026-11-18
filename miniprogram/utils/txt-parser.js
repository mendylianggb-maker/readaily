// Parse decoded txt text into book metadata and chapters.
// Chapters are stored as character offsets into the full text, so the text
// itself is never copied or modified.

const { countUnits } = require('./text-stats')

const CN_NUM = '0-9０-９零〇一二三四五六七八九十百千万两'
// "第一章 标题" / "第12回" / "第三卷：标题"; separator optional for short lines.
const CN_HEADING = new RegExp(
  '^第[' + CN_NUM + ']+[章回节卷集部篇](?:[\\s：:·、.．\\-—]+(.{0,30})|(.{0,15}))$'
)
const CN_SPECIAL = /^(序章|序言|序|楔子|引子|前言|后记|尾声|终章|番外.{0,15})$/

const EN_NUM_WORDS = [
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty'
].join('|')
const EN_HEADING = new RegExp(
  '^(?:chapter|chap\\.?)\\s+(?:\\d+|[ivxlcdm]+|(?:' + EN_NUM_WORDS + ')(?:-(?:' + EN_NUM_WORDS + '))?)\\b(?:[\\s.:\\-–—]+(.{0,60}))?$',
  'i'
)
const EN_SPECIAL = /^(prologue|epilogue|preface|introduction|afterword)$/i

const SENTENCE_END = /[。！？，、；,;!?]$/
// Text before the first heading shorter than this is treated as front matter
// (title, author line) and dropped; longer text becomes its own chapter.
const MIN_FRONT_UNITS = 200

function isHeading(line) {
  if (line.length > 60) return false
  if (CN_HEADING.test(line)) {
    // "第一章了。" is prose, not a heading.
    return !SENTENCE_END.test(line)
  }
  return CN_SPECIAL.test(line) || EN_HEADING.test(line) || EN_SPECIAL.test(line)
}

function titleFromFileName(fileName) {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[《》]/g, '')
    .replace(/[（(\[【](全本|全集|完结|精校|校对|txt)[^）)\]】]*[）)\]】]/gi, '')
    .trim()
}

function findAuthor(lines) {
  for (const line of lines.slice(0, 20)) {
    const cn = line.match(/^作者[：:\s]\s*(.{1,30})$/)
    if (cn) return cn[1].trim()
    const en = line.match(/^by\s+([A-Z][\w.'\- ]{1,40})$/i)
    if (en) return en[1].trim()
  }
  return ''
}

/**
 * @param {string} text decoded text with "\n" newlines
 * @param {string} fileName original file name
 * @returns {{
 *   title: string, author: string, language: 'zh' | 'en',
 *   stats: { cjk: number, words: number },
 *   hasChapters: boolean,
 *   chapters: { title: string, start: number, end: number }[]
 * }}
 * Chapter `start`/`end` are offsets of the chapter body (after the heading line).
 */
function parseTxt(text, fileName) {
  const headings = [] // { title, lineStart, bodyStart }
  const firstLines = []
  let pos = 0
  while (pos <= text.length) {
    let next = text.indexOf('\n', pos)
    if (next === -1) next = text.length
    const line = text.slice(pos, next).trim()
    if (line) {
      if (firstLines.length < 20) firstLines.push(line)
      if (isHeading(line)) headings.push({ title: line, lineStart: pos, bodyStart: next + 1 })
    }
    pos = next + 1
  }

  const title = titleFromFileName(fileName) || (firstLines[0] || '').slice(0, 30)
  const author = findAuthor(firstLines)
  const chapters = []

  if (headings.length === 0) {
    chapters.push({ title, start: 0, end: text.length })
  } else {
    const front = text.slice(0, headings[0].lineStart)
    const frontUnits = countUnits(front)
    if (frontUnits.cjk + frontUnits.words >= MIN_FRONT_UNITS) {
      chapters.push({ title: '开始', start: 0, end: headings[0].lineStart })
    }
    headings.forEach((h, i) => {
      const end = i + 1 < headings.length ? headings[i + 1].lineStart : text.length
      chapters.push({ title: h.title, start: Math.min(h.bodyStart, end), end })
    })
  }

  const stats = countUnits(text)
  return {
    title,
    author,
    language: stats.cjk >= stats.words ? 'zh' : 'en',
    stats,
    hasChapters: headings.length > 0,
    chapters
  }
}

module.exports = { parseTxt, isHeading }
