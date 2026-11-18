const {
  MAX_FILE_SIZE,
  chooseBookFile,
  readFileAsArrayBuffer,
  getExtension,
  formatSize
} = require('../../utils/file')

const PREVIEW_BYTES = 600

Page({
  data: {
    file: null, // { name, sizeText, ext }
    preview: '',
    error: '',
    loading: false
  },

  async onChooseFile() {
    this.setData({ error: '', file: null, preview: '' })

    let picked
    try {
      picked = await chooseBookFile()
    } catch (err) {
      // User cancelled the picker: not an error.
      if (err && /cancel/i.test(err.errMsg || '')) return
      this.setData({ error: '选择文件失败，请重试' })
      return
    }

    const ext = getExtension(picked.name)
    if (ext !== 'txt' && ext !== 'epub') {
      this.setData({ error: '只支持 txt 和 epub 格式' })
      return
    }
    if (picked.size > MAX_FILE_SIZE) {
      this.setData({ error: '文件太大了，最大支持 50MB' })
      return
    }

    this.setData({
      loading: true,
      file: { name: picked.name, sizeText: formatSize(picked.size), ext }
    })

    try {
      const buffer = await readFileAsArrayBuffer(picked.path)
      // Step 1 only: naive UTF-8 preview. Encoding detection comes next,
      // so GBK files will look garbled here for now.
      const preview = ext === 'txt' ? naiveUtf8Preview(buffer) : '（epub 解析稍后支持）'
      this.setData({ preview })
    } catch (err) {
      this.setData({ error: '读取文件失败，请重试' })
    } finally {
      this.setData({ loading: false })
    }
  }
})

// Temporary: decode the first bytes as UTF-8 with replacement characters.
function naiveUtf8Preview(buffer) {
  const bytes = new Uint8Array(buffer, 0, Math.min(PREVIEW_BYTES, buffer.byteLength))
  let out = ''
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    let len = b < 0x80 ? 1 : b >= 0xf8 ? 0 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 0
    if (len === 0 || i + len > bytes.length) {
      out += '�'
      i += 1
      continue
    }
    let code = len === 1 ? b : b & (0xff >> (len + 1))
    let ok = true
    for (let k = 1; k < len; k++) {
      const c = bytes[i + k]
      if ((c & 0xc0) !== 0x80) { ok = false; break }
      code = (code << 6) | (c & 0x3f)
    }
    if (!ok || code > 0x10ffff) {
      out += '�'
      i += 1
      continue
    }
    out += String.fromCodePoint(code)
    i += len
  }
  return out
}
