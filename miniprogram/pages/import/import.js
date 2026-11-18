const {
  MAX_FILE_SIZE,
  chooseBookFile,
  readFileAsArrayBuffer,
  getExtension,
  formatSize
} = require('../../utils/file')
const { decodeText } = require('../../utils/encoding')
const { parseTxt } = require('../../utils/txt-parser')
const { readingMinutes, formatAmount } = require('../../utils/text-stats')
const library = require('../../utils/library')

const PREVIEW_CHARS = 300
const DEFAULT_DAILY_MINUTES = 10
const CHAPTER_PREVIEW_COUNT = 3

Page({
  data: {
    file: null, // { name, sizeText, ext }
    book: null, // summary shown on the confirmation card
    chapterTitles: [], // first few chapter titles only
    preview: '',
    error: '',
    loading: false
  },

  // Full text and parse result are kept off `data`: setData is limited to ~1 MB.
  parsed: null,
  text: '',

  async onChooseFile() {
    this.parsed = null
    this.text = ''
    this.setData({ error: '', file: null, book: null, chapterTitles: [], preview: '' })

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
      if (ext === 'epub') {
        this.setData({ error: 'epub 解析稍后支持' })
        return
      }
      const decoded = decodeText(buffer)
      if (decoded.error) {
        this.setData({ error: '无法识别这个文件的编码，请换成 UTF-8 或 GBK 编码的 txt' })
        return
      }
      this.showParsed(decoded.text, parseTxt(decoded.text, picked.name), decoded.encoding)
    } catch (err) {
      console.error(err)
      this.setData({ error: '读取文件失败，请重试' })
    } finally {
      this.setData({ loading: false })
    }
  },

  showParsed(text, parsed, encoding) {
    if (parsed.stats.cjk + parsed.stats.words === 0) {
      this.setData({ error: '这个文件里没有可读的文字' })
      return
    }
    this.text = text
    this.parsed = parsed

    const days = Math.max(1, Math.ceil(readingMinutes(parsed.stats) / DEFAULT_DAILY_MINUTES))
    const first = parsed.chapters[0]
    this.setData({
      book: {
        title: parsed.title,
        author: parsed.author,
        languageText: parsed.language === 'zh' ? '中文' : '英文',
        amountText: formatAmount(parsed.stats, parsed.language),
        chapterCount: parsed.hasChapters ? parsed.chapters.length : 0,
        days,
        dailyMinutes: DEFAULT_DAILY_MINUTES,
        encoding
      },
      chapterTitles: parsed.chapters.slice(0, CHAPTER_PREVIEW_COUNT).map((c) => c.title),
      preview: text.slice(first.start, first.start + PREVIEW_CHARS).trim()
    })
  },

  onTitleInput(e) {
    this.setData({ 'book.title': e.detail.value })
  },

  onAuthorInput(e) {
    this.setData({ 'book.author': e.detail.value })
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
      library.addBook({ text: this.text, parsed: this.parsed, title, author, format: 'txt' })
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
