const library = require('../../utils/library')
const plans = require('../../utils/plan')
const reading = require('../../utils/reading')
const { todayKey, shortLabel, isDevBuild, getDayOffset, setDayOffset } = require('../../utils/dates')
const { MINUTE_OPTIONS, confirm } = require('../../utils/ui')

Page({
  data: {
    minuteOptions: MINUTE_OPTIONS,
    plan: null, // { title, dailyMinutes }
    dev: null // { todayLabel, offset } in develop/trial builds only
  },

  onShow() {
    const bookId = library.getCurrentBookId()
    const plan = bookId ? plans.loadPlan(bookId) : null
    this.setData({
      plan: plan ? { title: library.getBook(bookId).title, dailyMinutes: plan.dailyMinutes } : null,
      dev: isDevBuild() ? { todayLabel: shortLabel(todayKey()), offset: getDayOffset() } : null
    })
  },

  async onMinutes(e) {
    const minutes = Number(e.currentTarget.dataset.value)
    if (!this.data.plan || minutes === this.data.plan.dailyMinutes) return
    const ok = await confirm(
      '改成每天 ' + minutes + ' 分钟？',
      '没读的部分会从今天起重新拆分和排期，已经读完的不受影响。',
      '修改'
    )
    if (!ok) return
    wx.showLoading({ title: '重新排期中', mask: true })
    reading.changeDailyMinutes(library.getCurrentBookId(), minutes)
    wx.hideLoading()
    this.setData({ 'plan.dailyMinutes': minutes })
    wx.showToast({ title: '已修改', icon: 'success' })
  },

  // --- Simulated date (develop/trial builds only) ---
  shiftDays(n) {
    setDayOffset(n === 0 ? 0 : getDayOffset() + n)
    this.onShow()
  },

  onPrevDay() { this.shiftDays(-1) },
  onNextDay() { this.shiftDays(1) },
  onNextWeek() { this.shiftDays(7) },
  onResetDay() { this.shiftDays(0) }
})
