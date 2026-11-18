const library = require('../../utils/library')
const plans = require('../../utils/plan')
const { formatAmount } = require('../../utils/text-stats')

const MESSAGES = [
  '读完一整本书了！今天奖励一下自己吧，去喝杯喜欢的饮料。',
  '坚持了 {days} 天，这本书是你的了。给自己放个不看手机的下午吧。',
  '又读完一本。挑个小礼物送给认真读书的自己。',
  '{days} 天，一页一页读到了最后。今晚早点睡，做个好梦。',
  '这本书读完了，你也比开始时多了一点点东西。出去走走，奖励一下自己。'
]
const COLORS = ['#4caf7a', '#f2c14e', '#e57373', '#64b5f6', '#ba68c8']

Page({
  data: {
    title: '',
    days: 0,
    sessions: 0,
    onTimeRate: 0,
    amountText: '',
    message: '',
    confetti: []
  },

  onLoad(options) {
    const book = library.getBook(options.bookId)
    const plan = plans.loadPlan(options.bookId)
    if (!book || !plan) return
    const readDates = new Set(plan.sessions.map((s) => s.done).filter(Boolean))
    const onTime = plan.sessions.filter((s) => s.done && (s.bm || s.done <= s.date)).length
    const days = readDates.size
    const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)].replace('{days}', days)
    const confetti = Array.from({ length: 40 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2,
      color: COLORS[i % COLORS.length],
      rotate: Math.floor(Math.random() * 360)
    }))
    this.setData({
      title: book.title,
      days,
      sessions: plan.sessions.length,
      onTimeRate: Math.round((onTime / plan.sessions.length) * 100),
      amountText: formatAmount(book.stats, book.language),
      message,
      confetti
    })
  },

  onBookshelf() {
    wx.switchTab({ url: '/pages/bookshelf/bookshelf' })
  },

  onImport() {
    wx.redirectTo({ url: '/pages/import/import' })
  }
})
