const library = require('../../utils/library')
const plans = require('../../utils/plan')
const reading = require('../../utils/reading')
const checkins = require('../../utils/checkins')
const { todayKey, toKey, shortLabel } = require('../../utils/dates')
const { BOOKMARK_EXPLAINER } = require('../../utils/ui')

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

Page({
  data: {
    weekdays: WEEKDAYS,
    year: 0,
    month: 0, // 1-12
    cells: [], // { key, day, state, isToday, index } or { empty: true }
    stats: null,
    hasBook: false,
    bookmarkMode: false
  },

  onShow() {
    if (!this.data.year) {
      const now = new Date()
      this.setData({ year: now.getFullYear(), month: now.getMonth() + 1 })
    }
    this.render()
  },

  render() {
    const today = todayKey()
    checkins.updateRewards(today)
    const bookId = library.getCurrentBookId()
    const plan = bookId ? plans.loadPlan(bookId) : null
    const map = plan ? reading.dateMap(plan, today) : {}
    const ck = checkins.loadCheckins()
    const rewards = checkins.loadRewards()

    const { year, month } = this.data
    const first = new Date(year, month - 1, 1)
    const days = new Date(year, month, 0).getDate()
    const lead = (first.getDay() + 6) % 7
    const cells = []
    for (let i = 0; i < lead; i++) cells.push({ empty: true, key: 'e' + i })
    for (let d = 1; d <= days; d++) {
      const key = toKey(new Date(year, month - 1, d))
      const m = map[key]
      cells.push({
        key,
        day: d,
        state: m ? m.state : 'none',
        index: m ? m.index : -1,
        isToday: key === today
      })
    }

    let stats = {
      streak: checkins.streakInfo(today, ck).length,
      total: checkins.totalDays(today, ck),
      cards: rewards.cards,
      toNext: checkins.STREAK_FOR_CARD - checkins.cardProgress(today)
    }
    if (plan) {
      const done = plan.sessions.filter((s) => s.done).length
      const overdue = plans.overdueIndexes(plan, today).length
      stats = Object.assign(stats, {
        title: library.getBook(bookId).title,
        progress: Math.round((done / plan.sessions.length) * 100),
        endLabel: shortLabel(plan.sessions.reduce((a, s) => (s.date > a ? s.date : a), today)),
        overdue,
        showReschedule: overdue >= 7
      })
    }
    this.setData({ cells, stats, hasBook: !!plan })
  },

  onPrevMonth() {
    const m = this.data.month === 1 ? { year: this.data.year - 1, month: 12 } : { year: this.data.year, month: this.data.month - 1 }
    this.setData(m)
    this.render()
  },

  onNextMonth() {
    const m = this.data.month === 12 ? { year: this.data.year + 1, month: 1 } : { year: this.data.year, month: this.data.month + 1 }
    this.setData(m)
    this.render()
  },

  onDayTap(e) {
    const { index, state } = e.currentTarget.dataset
    if (index < 0) return
    const bookId = library.getCurrentBookId()

    if (this.data.bookmarkMode) {
      if (state !== 'late') {
        wx.showToast({ title: '请选一个黄色的补读日', icon: 'none' })
        return
      }
      if (reading.bookmarkSession(bookId, index)) {
        wx.showToast({ title: '已变成按时完成', icon: 'success' })
        this.setData({ bookmarkMode: false })
        this.render()
      }
      return
    }
    wx.navigateTo({ url: '/pages/reader/reader?bookId=' + bookId + '&index=' + index })
  },

  onCardsTap() {
    const { cards } = this.data.stats
    const hasLate = this.data.cells.some((c) => c.state === 'late')
    if (cards > 0 && this.data.hasBook && hasLate) {
      this.setData({ bookmarkMode: true })
      return
    }
    this.onExplain(cards > 0 ? '这个月没有黄色的补读日，翻到其他月份看看。' : '')
  },

  onExplain(extra) {
    const tail = typeof extra === 'string' && extra
      ? '\n\n' + extra
      : '\n\n离下一张还差 ' + this.data.stats.toNext + ' 天。'
    wx.showModal({ title: '时光书签', content: BOOKMARK_EXPLAINER + tail, showCancel: false, confirmText: '知道了' })
  },

  onCancelBookmark() {
    this.setData({ bookmarkMode: false })
  },

  onReschedule() {
    wx.showModal({
      title: '重新排期',
      content: '把还没读的内容从今天开始重新排，待补读清零，读完的日子会往后推。',
      confirmText: '重新排期',
      success: (res) => {
        if (!res.confirm) return
        reading.rescheduleBook(library.getCurrentBookId())
        this.render()
      }
    })
  }
})
