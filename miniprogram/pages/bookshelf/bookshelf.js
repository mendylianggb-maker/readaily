const library = require('../../utils/library')
const plans = require('../../utils/plan')
const reading = require('../../utils/reading')
const { chooseDailyMinutes, confirm } = require('../../utils/ui')

const STATUS_TEXT = { reading: '在读', paused: '暂停', finished: '读完' }
const { placeholderColor } = require('../../utils/cover')
const { formatAmount } = require('../../utils/text-stats')

Page({
  data: {
    books: []
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const books = library
      .listBooks()
      .slice()
      .sort((a, b) => b.importedAt - a.importedAt)
      .map((b) => ({
        id: b.id,
        title: b.title,
        author: b.author,
        coverPath: b.coverPath,
        coverColor: placeholderColor(b.title),
        coverText: b.title.slice(0, 6),
        status: b.status,
        statusText: STATUS_TEXT[b.status] || '',
        infoText: formatAmount(b.stats, b.language) + (b.chapterCount ? ' · ' + b.chapterCount + ' 章' : '')
      }))
    this.setData({ books })
  },

  onImport() {
    wx.navigateTo({ url: '/pages/import/import' })
  },

  onBookTap(e) {
    const { id, title } = e.currentTarget.dataset
    const book = library.getBook(id)
    const actions = []
    if (book.status === 'reading') actions.push({ text: '继续阅读', run: () => wx.switchTab({ url: '/pages/home/home' }) })
    else if (book.status === 'paused') actions.push({ text: '继续读这本', run: () => this.start(id) })
    else if (book.status === 'finished') actions.push({ text: '再读一遍', run: () => this.restart(id) })
    else actions.push({ text: '开始读这本', run: () => this.start(id) })
    if (book.extraCount) {
      actions.push({
        text: '查看附加内容（' + book.extraCount + '）',
        run: () => wx.navigateTo({ url: '/pages/extras/extras?bookId=' + id })
      })
    }
    actions.push({ text: '删除', run: () => this.confirmDelete(id, title) })
    wx.showActionSheet({
      itemList: actions.map((a) => a.text),
      success: (res) => actions[res.tapIndex].run()
    })
  },

  async start(id) {
    const current = library.getCurrentBookId()
    if (current && current !== id) {
      const ok = await confirm('切换到这本书？', '《' + library.getBook(current).title + '》会暂停，进度会保留，以后可以接着读。', '切换')
      if (!ok) return
    }
    let minutes = null
    if (!plans.loadPlan(id)) {
      minutes = await chooseDailyMinutes()
      if (!minutes) return
    }
    reading.startBook(id, minutes)
    wx.switchTab({ url: '/pages/home/home' })
  },

  async restart(id) {
    const current = library.getCurrentBookId()
    const content = current
      ? '会从第 1 天重新排计划，《' + library.getBook(current).title + '》会暂停。打卡记录都会保留。'
      : '会从第 1 天重新排计划，打卡记录会保留。'
    if (!(await confirm('再读一遍？', content, '再读一遍'))) return
    const minutes = await chooseDailyMinutes()
    if (!minutes) return
    reading.restartBook(id, minutes)
    wx.switchTab({ url: '/pages/home/home' })
  },

  onBookLongPress(e) {
    const { id, title } = e.currentTarget.dataset
    this.confirmDelete(id, title)
  },

  confirmDelete(id, title) {
    wx.showModal({
      title: '删除《' + title + '》？',
      content: '正文和阅读进度会一起删除，打卡记录会保留。',
      confirmText: '删除',
      confirmColor: '#c0392b',
      success: (res) => {
        if (!res.confirm) return
        library.deleteBook(id)
        this.refresh()
      }
    })
  }
})
