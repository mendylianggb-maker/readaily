// Text encoding detection and decoding for imported txt files.
// Supports UTF-8 (with or without BOM), UTF-16 LE/BE (with BOM), and GBK/GB18030.

const GBK_TABLE = require('./gbk-table')

const REPLACEMENT = 0xfffd
const CHUNK = 8192
// If more than this share of decoded characters are U+FFFD, give up.
const MAX_BAD_RATIO = 0.01

// Collects UTF-16 code units and joins them in chunks (fast and stack-safe).
function createBuilder() {
  const parts = []
  let buf = []
  return {
    push(code) {
      if (code > 0xffff) {
        code -= 0x10000
        buf.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff))
      } else {
        buf.push(code)
      }
      if (buf.length >= CHUNK) {
        parts.push(String.fromCharCode.apply(null, buf))
        buf = []
      }
    },
    done() {
      if (buf.length) parts.push(String.fromCharCode.apply(null, buf))
      return parts.join('')
    }
  }
}

// Strict UTF-8 decode. Returns null if the bytes are not valid UTF-8.
function decodeUtf8Strict(bytes, start) {
  const out = createBuilder()
  let i = start
  const n = bytes.length
  while (i < n) {
    const b = bytes[i]
    if (b < 0x80) {
      out.push(b)
      i += 1
      continue
    }
    let len, code, min
    if (b >= 0xc2 && b <= 0xdf) { len = 2; code = b & 0x1f; min = 0x80 }
    else if (b >= 0xe0 && b <= 0xef) { len = 3; code = b & 0x0f; min = 0x800 }
    else if (b >= 0xf0 && b <= 0xf4) { len = 4; code = b & 0x07; min = 0x10000 }
    else return null
    if (i + len > n) return null
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k]
      if ((c & 0xc0) !== 0x80) return null
      code = (code << 6) | (c & 0x3f)
    }
    if (code < min || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null
    out.push(code)
    i += len
  }
  return out.done()
}

function decodeUtf16(bytes, start, littleEndian) {
  const out = createBuilder()
  for (let i = start; i + 1 < bytes.length; i += 2) {
    out.push(littleEndian ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1])
  }
  return out.done()
}

// GBK/GB18030 decode. Four-byte GB18030 sequences (rare characters) become U+FFFD.
// Returns { text, bad } where bad is the number of U+FFFD produced.
function decodeGbk(bytes) {
  const out = createBuilder()
  let bad = 0
  let i = 0
  const n = bytes.length
  while (i < n) {
    const b = bytes[i]
    if (b < 0x80) {
      out.push(b)
      i += 1
      continue
    }
    if (b === 0x80 || b === 0xff || i + 1 >= n) {
      out.push(REPLACEMENT); bad++
      i += 1
      continue
    }
    const t = bytes[i + 1]
    if (t >= 0x30 && t <= 0x39) {
      // Four-byte GB18030 sequence: skip it.
      out.push(REPLACEMENT); bad++
      i += 4
      continue
    }
    if (t < 0x40 || t === 0x7f || t === 0xff) {
      out.push(REPLACEMENT); bad++
      i += 1
      continue
    }
    const trailIndex = t < 0x7f ? t - 0x40 : t - 0x41
    const code = GBK_TABLE.charCodeAt((b - 0x81) * 190 + trailIndex)
    if (code === REPLACEMENT) bad++
    out.push(code)
    i += 2
  }
  return { text: out.done(), bad }
}

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Detect the encoding of a txt file and decode it.
 * @param {ArrayBuffer} buffer
 * @returns {{ text: string, encoding: string } | { error: string }}
 */
function decodeText(buffer) {
  const bytes = new Uint8Array(buffer)

  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const text = decodeUtf8Strict(bytes, 3)
    if (text !== null) return { text: normalizeNewlines(text), encoding: 'UTF-8 (BOM)' }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: normalizeNewlines(decodeUtf16(bytes, 2, true)), encoding: 'UTF-16 LE' }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: normalizeNewlines(decodeUtf16(bytes, 2, false)), encoding: 'UTF-16 BE' }
  }

  const utf8 = decodeUtf8Strict(bytes, 0)
  if (utf8 !== null) return { text: normalizeNewlines(utf8), encoding: 'UTF-8' }

  const gbk = decodeGbk(bytes)
  if (gbk.text.length > 0 && gbk.bad / gbk.text.length <= MAX_BAD_RATIO) {
    return { text: normalizeNewlines(gbk.text), encoding: 'GBK' }
  }

  return { error: 'unknown-encoding' }
}

module.exports = { decodeText }
