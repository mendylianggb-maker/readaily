const {
  MAX_FILE_SIZE,
  chooseBookFile,
  readFileAsArrayBuffer,
  getExtension,
  formatSize
} = require('../../utils/file')
const { decodeText } = require('../../utils/encoding')
const { parseTxt } = require('../../utils/txt-parser')
const { parseEpub, assembleBook } = require('../../utils/epub-parser')
const { readingMinutes, formatAmount } = require('../../utils/text-stats')
const library = require('../../utils/library')

const PREVIEW_CHARS = 300
const DEFAULT_DAILY_MINUTES = 10
const CHAPTER_PREVIEW_COUNT = 3

const EPUB_ERRORS = {
  drm: '这本书有版权保护（DRM），暂时不支持导入',
  'not-zip': '这个 epub 文件好像损坏了',
  'no-opf': '这个 epub 文件格式不完整',
  empty: '这本书里没有找到可读的文字'
}

Page({
  data: {
    file: null, // { name, sizeText, ext }
    book: null, // summary shown on the confirmation card
    chapterTitles: [], // first few chapter titles only
    coverPreview: '',
    // EPUB only: every item with its include state.
    items: [], // { title, extra, included }
    skippedText: '',
    showItems: false,
    preview: '',
    error: '',
    loading: false
  },

  // Large data is kept off `data`: setData is limited to ~1 MB.
  parsed: null, // txt: parseTxt() result; epub: assembleBook() result
  text: '',
  epub: null, // parseEpub() result
  format: '',

  async onChooseFile() {
    this.parsed = null
    this.text = ''
    this.epub = null
    writeCoverPreview(null)
    this.setData({
      error: '', file: null, book: null, chapterTitles: [], coverPreview: '',
      items: [], skippedText: '', showItems: false, preview: ''
    })

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

    this.format = ext
    this.setData({
      loading: true,
      file: { name: picked.name, sizeText: formatSize(picked.size), ext }
    })

    try {
      const buffer = await readFileAsArrayBuffer(picked.path)
      if (ext === 'epub') this.loadEpub(buffer, picked.name)
      else this.loadTxt(buffer, picked.name)
    } catch (err) {
      console.error(err)
      this.setData({ error: '读取文件失败，请重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  loadTxt(buffer, fileName) {
    const decoded = decodeText(buffer)
    if (decoded.error) {
      this.setData({ error: '无法识别这个文件的编码，请换成 UTF-8 或 GBK 编码的 txt' })
      return
    }
    const parsed = parseTxt(decoded.text, fileName)
    this.text = decoded.text
    this.showSummary(parsed, { title: parsed.title, author: parsed.author, detail: decoded.encoding })
  },

  loadEpub(buffer, fileName) {
    const epub = parseEpub(buffer, fileName)
    if (epub.error) {
      this.setData({ error: EPUB_ERRORS[epub.error] || '无法解析这本书' })
      return
    }
    this.epub = epub
    const items = epub.items.map((it) => ({ title: it.title, extra: it.extra, included: !it.extra }))
    this.setData({ items, coverPreview: writeCoverPreview(epub.cover) })
    this.rebuildEpub({ title: epub.title, author: epub.author, detail: 'EPUB' })
  },

  // Re-assemble the EPUB from the included items (after a toggle, too).
  rebuildEpub(meta) {
    const included = this.epub.items.filter((it, i) => this.data.items[i].included)
    const assembled = assembleBook(included)
    this.text = assembled.text
    const skipped = this.data.items.filter((it) => !it.included)
    this.setData({
      skippedText: skipped.length
        ? '已跳过 ' + skipped.length + ' 项：' + skipped.map((it) => it.title).join('、')
        : ''
    })
    this.showSummary(assembled, meta)
  },

  showSummary(parsed, meta) {
    if (parsed.stats.cjk + parsed.stats.words === 0) {
      this.setData({ error: '这本书里没有可读的文字', book: null })
      return
    }
    this.parsed = parsed
    const days = Math.max(1, Math.ceil(readingMinutes(parsed.stats) / DEFAULT_DAILY_MINUTES))
    const first = parsed.chapters[0]
    const prev = this.data.book
    this.setData({
      error: '',
      book: {
        // Keep the user's edits when re-assembling.
        title: prev ? prev.title : meta.title,
        author: prev ? prev.author : meta.author,
        languageText: parsed.language === 'zh' ? '中文' : '英文',
        amountText: formatAmount(parsed.stats, parsed.language),
        chapterCount: parsed.hasChapters ? parsed.chapters.length : 0,
        days,
        dailyMinutes: DEFAULT_DAILY_MINUTES,
        detail: prev ? prev.detail : meta.detail
      },
      chapterTitles: parsed.chapters.slice(0, CHAPTER_PREVIEW_COUNT).map((c) => c.title),
      preview: this.text.slice(first.start, first.start + PREVIEW_CHARS).trim()
    })
  },

  onTitleInput(e) {
    this.setData({ 'book.title': e.detail.value })
  },

  onAuthorInput(e) {
    this.setData({ 'book.author': e.detail.value })
  },

  onToggleItems() {
    this.setData({ showItems: !this.data.showItems })
  },

  onItemTap(e) {
    const i = e.currentTarget.dataset.index
    const included = !this.data.items[i].included
    if (!included && this.data.items.filter((it) => it.included).length === 1) {
      wx.showToast({ title: '至少保留一项', icon: 'none' })
      return
    }
    this.setData({ ['items[' + i + '].included']: included })
    this.rebuildEpub({})
  },

  async onConfirm() {
    const title = this.data.book.title.trim()
    const author = this.data.book.author.trim()
    if (!title) {
      wx.showToast({ title: '请填写书名', icon: 'none' })
      return
    }

    const duplicate = library.findDuplicate(title, this.parsed.stats)
    if (duplicate) {
      const choice = await askDuplicate()
      if (choice === 'cancel') return
      if (choice === 'overwrite') library.deleteBook(duplicate.id)
    }

    wx.showLoading({ title: '保存中', mask: true })
    try {
      library.addBook({
        text: this.text,
        parsed: this.parsed,
        title,
        author,
        format: this.format,
        cover: this.epub ? this.epub.cover : null
      })
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      wx.showModal({
        title: '保存失败',
        content: '手机存储空间可能不够了，可以先删掉书架上不读的书再试。',
        showCancel: false
      })
      return
    }
    wx.hideLoading()
    wx.showToast({ title: '已加入书架', icon: 'success' })
    setTimeout(() => wx.switchTab({ url: '/pages/bookshelf/bookshelf' }), 800)
  }
})

// Write the cover to a temp file so <image> can show it. Returns '' on failure.
// A new file name each time avoids <image> showing a cached old cover.
let lastPreviewPath = ''
function writeCoverPreview(cover) {
  const fs = wx.getFileSystemManager()
  if (lastPreviewPath) {
    try { fs.unlinkSync(lastPreviewPath) } catch (err) { /* already gone */ }
    lastPreviewPath = ''
  }
  if (!cover) return ''
  const path = wx.env.USER_DATA_PATH + '/import-cover-' + Date.now() + '.' + cover.ext
  try {
    const data = cover.data.buffer.slice(cover.data.byteOffset, cover.data.byteOffset + cover.data.byteLength)
    fs.writeFileSync(path, data)
    lastPreviewPath = path
    return path
  } catch (err) {
    console.error(err)
    return ''
  }
}

// Resolves to 'overwrite' | 'keep' | 'cancel'.
function askDuplicate() {
  return new Promise((resolve) => {
    wx.showActionSheet({
      alertText: '这本书已经在书架上了',
      itemList: ['覆盖原来的', '两本都保留'],
      success: (res) => resolve(res.tapIndex === 0 ? 'overwrite' : 'keep'),
      fail: () => resolve('cancel')
    })
  })
}
