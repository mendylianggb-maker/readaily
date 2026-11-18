// EPUB parsing. See requirements 1.4 (#4 EPUB scope, #9 cover image).
//
// parseEpub() returns a list of items (chapters plus front/back matter) with
// their own text. The import page lets the user include or exclude items,
// then assembleBook() joins the included items into one text with offsets,
// the same shape that parseTxt() produces.

const fflate = require('../vendor/fflate')
const { decodeEntities, parseAttrs, findTags, firstText, htmlToText } = require('./markup')
const { countUnits } = require('./text-stats')

const TEXT_FILE = /\.(opf|ncx|xml|xhtml|html|htm)$/i
const FONT_FILE = /\.(otf|ttf|woff2?)$/i
// Spine files that only hold footnotes are skipped entirely.
const FOOTNOTE_FILE = /([-_]fn\d*|footnotes?|endnotes?)\.x?html?$/i
// Items excluded by default (still shown on the import page).
const EXTRA_TITLE = new RegExp(
  '^(cover|title ?page|half ?title|copyright|contents|table of contents|dedication|epigraph|' +
    'acknowledg|about the (author|publisher)|also by|praise for|index|notes|bibliography|' +
    'references|endnotes|imprint|colophon|newsletter|' +
    '封面|扉页|版权|目录|致谢|献词|作者简介|关于作者|出版说明|书名页)',
  'i'
)
const EXTRA_FILE = /(cover|title_?page|copyright|toc|contents|dedication|acknowledg|about|also_?by|praise|index|colophon|qr_?code)/i

function utf8(bytes) {
  return fflate.strFromU8(bytes)
}

function dirOf(path) {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i + 1)
}

/** Resolve `href` relative to directory `base`, normalizing "." and "..". */
function resolvePath(base, href) {
  let decoded = href
  try {
    decoded = decodeURIComponent(href)
  } catch (err) {
    // Keep the raw href.
  }
  const parts = (base + decoded).split('/')
  const out = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.' && p !== '') out.push(p)
  }
  return out.join('/')
}

function splitHref(base, href) {
  const hash = href.indexOf('#')
  return {
    path: resolvePath(base, hash === -1 ? href : href.slice(0, hash)),
    fragment: hash === -1 ? '' : href.slice(hash + 1)
  }
}

function prettyFileName(path) {
  return path
    .replace(/^.*\//, '')
    .replace(/\.[^.]+$/, '')
    .replace(/^\d{10,13}[_-]?/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

function isDrmProtected(files) {
  if (files['META-INF/rights.xml']) return true
  const enc = files['META-INF/encryption.xml']
  if (!enc) return false
  // Font obfuscation also uses encryption.xml; only flag non-font resources.
  return findTags(utf8(enc), 'CipherReference').some((t) => !FONT_FILE.test(t.attrs.uri || ''))
}

function parseToc(files, manifest, opfDir, spineTocId) {
  // EPUB 3 nav document first.
  const navItem = manifest.list.find((it) => /(^|\s)nav(\s|$)/.test(it.properties))
  if (navItem && files[navItem.path]) {
    const html = utf8(files[navItem.path])
    const navs = findTags(html, 'nav')
    const tocNav = navs.find((n) => /toc/.test(n.attrs['epub:type'] || n.attrs.role || '')) || navs[0]
    if (tocNav) {
      const close = html.indexOf('</nav>', tocNav.end)
      const section = html.slice(tocNav.end, close === -1 ? html.length : close)
      const base = dirOf(navItem.path)
      const entries = []
      const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
      let m
      while ((m = re.exec(section)) !== null) {
        const href = parseAttrs(m[1]).href
        const title = decodeEntities(m[2].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()
        if (href && title) entries.push(Object.assign({ title }, splitHref(base, href)))
      }
      if (entries.length) return entries
    }
  }

  // EPUB 2 NCX.
  const ncxItem =
    manifest.byId[spineTocId] || manifest.list.find((it) => it.mediaType === 'application/x-dtbncx+xml')
  if (ncxItem && files[ncxItem.path]) {
    const xml = utf8(files[ncxItem.path])
    const base = dirOf(ncxItem.path)
    const entries = []
    const re = /<navLabel[^>]*>\s*<text[^>]*>([\s\S]*?)<\/text>[\s\S]*?<\/navLabel>\s*<content\b([^>]*)\/?>/gi
    let m
    while ((m = re.exec(xml)) !== null) {
      const src = parseAttrs(m[2]).src
      const title = decodeEntities(m[1]).replace(/\s+/g, ' ').trim()
      if (src && title) entries.push(Object.assign({ title }, splitHref(base, src)))
    }
    return entries
  }
  return []
}

function findCoverPath(files, manifest, opf, spine) {
  const byProp = manifest.list.find((it) => /(^|\s)cover-image(\s|$)/.test(it.properties))
  if (byProp) return byProp.path
  const meta = findTags(opf, 'meta').find((t) => (t.attrs.name || '').toLowerCase() === 'cover')
  if (meta && manifest.byId[meta.attrs.content]) return manifest.byId[meta.attrs.content].path
  const byName = manifest.list.find((it) => /^image\//.test(it.mediaType) && /cover/i.test(it.id + it.path))
  if (byName) return byName.path
  const first = spine[0]
  if (first && files[first.path]) {
    const img = findTags(utf8(files[first.path]), 'img')[0] || findTags(utf8(files[first.path]), 'image')[0]
    const src = img && (img.attrs.src || img.attrs['xlink:href'] || img.attrs.href)
    if (src) return resolvePath(dirOf(first.path), src)
  }
  return ''
}

/**
 * @param {ArrayBuffer} buffer
 * @param {string} fileName
 * @returns {{ error: string } | {
 *   title: string, author: string, language: 'zh' | 'en',
 *   items: { title: string, text: string, extra: boolean }[],
 *   cover: { data: Uint8Array, ext: string } | null
 * }}
 */
function parseEpub(buffer, fileName) {
  let files
  try {
    files = fflate.unzipSync(new Uint8Array(buffer), { filter: (f) => TEXT_FILE.test(f.name) })
  } catch (err) {
    return { error: 'not-zip' }
  }
  if (isDrmProtected(files)) return { error: 'drm' }

  const container = files['META-INF/container.xml']
  const rootfile = container && findTags(utf8(container), 'rootfile')[0]
  const opfPath = rootfile && rootfile.attrs['full-path']
  if (!opfPath || !files[opfPath]) return { error: 'no-opf' }

  const opf = utf8(files[opfPath])
  const opfDir = dirOf(opfPath)

  const manifest = { list: [], byId: {} }
  for (const t of findTags(opf, 'item')) {
    if (!t.attrs.href) continue
    const item = {
      id: t.attrs.id || '',
      path: resolvePath(opfDir, t.attrs.href),
      mediaType: t.attrs['media-type'] || '',
      properties: t.attrs.properties || ''
    }
    manifest.list.push(item)
    if (item.id) manifest.byId[item.id] = item
  }

  const spineTag = findTags(opf, 'spine')[0]
  const spine = findTags(opf, 'itemref')
    .map((t) => ({ item: manifest.byId[t.attrs.idref], linear: t.attrs.linear !== 'no' }))
    .filter((s) => s.item && files[s.item.path] && s.linear && !FOOTNOTE_FILE.test(s.item.path))
    .map((s) => ({ path: s.item.path }))
  if (spine.length === 0) return { error: 'empty' }

  // Plain text of every spine file.
  const docs = spine.map((s) => Object.assign({ path: s.path }, htmlToText(utf8(files[s.path]))))
  const docIndex = {}
  docs.forEach((d, i) => { docIndex[d.path] = i })

  // TOC entries mapped to (doc, offset), in reading order.
  const seen = new Set()
  const marks = parseToc(files, manifest, opfDir, spineTag && spineTag.attrs.toc)
    .filter((e) => docIndex[e.path] !== undefined)
    .map((e) => {
      const doc = docIndex[e.path]
      const offset = e.fragment && docs[doc].ids[e.fragment] !== undefined ? docs[doc].ids[e.fragment] : 0
      return { title: e.title, doc, offset }
    })
    .filter((m) => {
      const key = m.doc + ':' + m.offset
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => a.doc - b.doc || a.offset - b.offset)

  const items = []
  const sliceRange = (fromDoc, fromOff, toDoc, toOff) => {
    let text = ''
    for (let d = fromDoc; d <= toDoc && d < docs.length; d++) {
      const start = d === fromDoc ? fromOff : 0
      const end = d === toDoc ? toOff : docs[d].text.length
      text += docs[d].text.slice(start, end)
    }
    return text
  }

  if (marks.length === 0) {
    // No usable TOC: one item per spine file.
    docs.forEach((d) => {
      const title = firstHeading(utf8(files[d.path])) || prettyFileName(d.path)
      items.push({ title, text: d.text, extra: EXTRA_TITLE.test(title) || EXTRA_FILE.test(d.path) })
    })
  } else {
    // Spine files before the first TOC entry (cover, title page, ...).
    for (let d = 0; d < marks[0].doc; d++) {
      items.push({ title: prettyFileName(docs[d].path), text: docs[d].text, extra: true })
    }
    marks.forEach((m, i) => {
      const next = marks[i + 1]
      const text = next
        ? sliceRange(m.doc, m.offset, next.doc, next.offset)
        : sliceRange(m.doc, m.offset, docs.length - 1, docs[docs.length - 1].text.length)
      items.push({ title: m.title, text, extra: EXTRA_TITLE.test(m.title) || (EXTRA_FILE.test(docs[m.doc].path) && m.offset === 0 && countAll(text) < 300) })
    })
  }

  items.forEach((it) => { it.text = stripLeadingTitle(it.text, it.title) })
  const nonEmpty = items.filter((it) => it.text.trim())
  if (nonEmpty.length === 0) return { error: 'empty' }

  // Cover image: a second, targeted unzip.
  let cover = null
  const coverPath = findCoverPath(files, manifest, opf, spine)
  if (coverPath) {
    try {
      const found = fflate.unzipSync(new Uint8Array(buffer), { filter: (f) => f.name === coverPath })
      if (found[coverPath]) {
        const ext = (coverPath.match(/\.(jpe?g|png|gif|webp)$/i) || [])[1]
        if (ext) cover = { data: found[coverPath], ext: ext.toLowerCase().replace('jpeg', 'jpg') }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const stats = countUnits(nonEmpty.map((it) => it.text).join('\n'))
  return {
    title: firstText(opf, 'title') || fileName.replace(/\.epub$/i, ''),
    author: firstText(opf, 'creator'),
    language: stats.cjk >= stats.words ? 'zh' : 'en',
    items: nonEmpty,
    cover
  }
}

// Lowercase, letters/digits/CJK only, for loose title comparison.
function normalizeTitle(s) {
  return s.toLowerCase().replace(/[^0-9a-z\u3400-\u9fff]+/g, '')
}

/** Drop the first one or two lines when they just repeat the chapter title. */
function stripLeadingTitle(text, title) {
  const target = normalizeTitle(title)
  if (!target) return text
  const lines = text.split('\n')
  for (const n of [2, 1]) {
    if (lines.length >= n && normalizeTitle(lines.slice(0, n).join(' ')) === target) {
      return lines.slice(n).join('\n')
    }
  }
  return text
}

function countAll(text) {
  const s = countUnits(text)
  return s.cjk + s.words
}

function firstHeading(html) {
  for (const tag of ['h1', 'h2', 'h3', 'title']) {
    const t = firstText(html, tag)
    if (t) return t
  }
  return ''
}

/**
 * Join included items into one text, in the same shape as parseTxt().
 * @param {{ title: string, text: string }[]} items included items, in order
 */
function assembleBook(items) {
  let text = ''
  const chapters = []
  for (const it of items) {
    const body = it.text.endsWith('\n') ? it.text : it.text + '\n'
    chapters.push({ title: it.title, start: text.length, end: text.length + body.length })
    text += body
  }
  const stats = countUnits(text)
  return {
    text,
    chapters,
    stats,
    language: stats.cjk >= stats.words ? 'zh' : 'en',
    hasChapters: chapters.length > 1
  }
}

module.exports = { parseEpub, assembleBook }
