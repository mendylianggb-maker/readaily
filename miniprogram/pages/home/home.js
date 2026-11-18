const reading = require('../../utils/reading')
const checkins = require('../../utils/checkins')
const { placeholderColor } = require('../../utils/cover')
const { BOOKMARK_EXPLAINER } = require('../../utils/ui')

Page({
  data: {
    view: null
  },

  onShow() {
    const view = reading.homeView()
    if (view.book) view.book.coverColor = placeholderColor(view.book.title)
    this.setData({ view })
    if (view.newCards > 0) this.announceCard()
  },

  announceCard() {
    const r = checkins.loadRewards()
    wx.showModal({
      title: '获得一张时光书签 🔖',
      content: r.explained ? '连续打卡 14 天，奖励一张时光书签。' : BOOKMARK_EXPLAINER,
      showCancel: false,
      confirmText: '知道了'
    })
    checkins.markExplained()
  },

  openSession(index) {
    wx.navigateTo({ url: '/pages/reader/reader?bookId=' + this.data.view.book.id + '&index=' + index })
  },

  onReadToday() {
    this.openSession(this.data.view.todaySession.index)
  },

  onReadAhead() {
    this.openSession(this.data.view.aheadIndex)
  },

  onCatchUp() {
    this.openSession(this.data.view.firstOverdue)
  },

  onReschedule() {
    wx.showModal({
      title: '重新排期',
      content: '把还没读的内容从今天开始重新排，待补读清零，读完的日子会往后推。',
      confirmText: '重新排期',
      success: (res) => {
        if (!res.confirm) return
        reading.rescheduleBook(this.data.view.book.id)
        this.onShow()
      }
    })
  },

  onImport() {
    wx.navigateTo({ url: '/pages/import/import' })
  },

  onBookshelf() {
    wx.switchTab({ url: '/pages/bookshelf/bookshelf' })
  },

  onCalendar() {
    wx.switchTab({ url: '/pages/calendar/calendar' })
  },

  onSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  }
})
