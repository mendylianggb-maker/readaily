const library = require('../../utils/library')
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
        infoText: formatAmount(b.stats, b.language) + (b.chapterCount ? ' · ' + b.chapterCount + ' 章' : '')
      }))
    this.setData({ books })
  },

  onImport() {
    wx.navigateTo({ url: '/pages/import/import' })
  },

  onBookLongPress(e) {
    const { id, title } = e.currentTarget.dataset
    wx.showActionSheet({
      itemList: ['删除'],
      itemColor: '#c0392b',
      success: () => {
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
  }
})
