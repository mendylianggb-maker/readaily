// Minimal XML/HTML helpers. Mini programs have no DOMParser, so EPUB files
// are read with small regex-based scanners. Attribute order never matters.

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', middot: '·', bull: '•', copy: '©', reg: '®', trade: '™',
  deg: '°', times: '×', eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü',
  ouml: 'ö', auml: 'ä', iuml: 'ï', ntilde: 'ñ', shy: ''
}

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ''
    }
    const named = NAMED_ENTITIES[e.toLowerCase()]
    return named === undefined ? m : named
  })
}

/** Parse `a="1" b='2'` into { a: '1', b: '2' } (names lowercased, values decoded). */
function parseAttrs(s) {
  const attrs = {}
  const re = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g
  let m
  while ((m = re.exec(s)) !== null) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[3] !== undefined ? m[3] : m[4])
  }
  return attrs
}

/** All opening/self-closing tags named `name` (namespace prefix ignored). */
function findTags(xml, name) {
  const re = new RegExp('<(?:[\\w-]+:)?' + name + '(\\s[^>]*)?>', 'gi')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) out.push({ attrs: parseAttrs(m[1] || ''), index: m.index, end: re.lastIndex })
  return out
}

/** Text content of the first element named `name`, tags stripped. */
function firstText(xml, name) {
  const m = xml.match(new RegExp('<(?:[\\w-]+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?' + name + '>', 'i'))
  return m ? decodeEntities(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() : ''
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article',
  'br', 'tr', 'dt', 'dd', 'figcaption', 'hr', 'pre', 'table', 'ul', 'ol', 'header', 'footer',
  'aside', 'nav', 'body'
])

/**
 * Convert an XHTML document to plain text, one paragraph per line.
 * Footnote references (<sup>, noteref links), scripts, and styles are dropped.
 * @returns {{ text: string, ids: Object<string, number> }} ids maps element id -> text offset
 */
function htmlToText(html) {
  let body = html
  const bodyStart = body.search(/<body[\s>]/i)
  if (bodyStart !== -1) body = body.slice(bodyStart)
  body = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|sup)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\b[^>]*epub:type\s*=\s*["'][^"']*noteref[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '')

  const lines = []
  const ids = {}
  let length = 0 // length of text emitted so far, including newlines
  let line = ''

  const flush = () => {
    const t = line.replace(/\s+/g, ' ').trim()
    if (t) {
      lines.push(t)
      length += t.length + 1
    }
    line = ''
  }

  const re = /<(\/?)([a-zA-Z][\w:-]*)([^>]*)>|([^<]+)/g
  let m
  while ((m = re.exec(body)) !== null) {
    if (m[4] !== undefined) {
      line += decodeEntities(m[4])
      continue
    }
    const tag = m[2].toLowerCase().replace(/^\w+:/, '')
    if (BLOCK_TAGS.has(tag)) flush()
    if (!m[1]) {
      const idMatch = m[3].match(/\bid\s*=\s*["']([^"']+)["']/)
      // An anchor maps to the start of the line it appears in.
      if (idMatch && ids[idMatch[1]] === undefined) ids[idMatch[1]] = length
    }
  }
  flush()
  return { text: lines.length ? lines.join('\n') + '\n' : '', ids }
}

module.exports = { decodeEntities, parseAttrs, findTags, firstText, htmlToText }
