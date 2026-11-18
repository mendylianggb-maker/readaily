// Skipped EPUB content (cover page, index, acknowledgments, ...).
const library = require('../../utils/library')

Page({
  data: {
    title: '',
    items: []
  },

  bookId: '',

  onLoad(options) {
    this.bookId = options.bookId
    const book = library.getBook(this.bookId)
    const detail = library.getBookDetail(this.bookId)
    this.setData({
      title: book ? book.title : '',
      items: ((detail && detail.extras) || []).map((x) => x.title)
    })
  },

  onOpen(e) {
    wx.navigateTo({ url: '/pages/reader/reader?bookId=' + this.bookId + '&extra=' + e.currentTarget.dataset.index })
  }
})
