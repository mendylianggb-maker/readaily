const library = require('../../utils/library')
const plans = require('../../utils/plan')
const reading = require('../../utils/reading')
const {
  todayKey, shortLabel, envVersion, canUnlockDevTools, devToolsEnabled, setDevToolsUnlocked, getDayOffset, setDayOffset
} = require('../../utils/dates')

const UNLOCK_TAPS = 7
const VERSION_TEXT = { develop: '开发版', trial: '体验版', release: '' }
const { MINUTE_OPTIONS, confirm } = require('../../utils/ui')

Page({
  data: {
    minuteOptions: MINUTE_OPTIONS,
    plan: null, // { title, dailyMinutes }
    dev: null, // { todayLabel, offset } when dev tools are enabled
    versionText: ''
  },

  versionTaps: 0,

  onShow() {
    const bookId = library.getCurrentBookId()
    const plan = bookId ? plans.loadPlan(bookId) : null
    this.setData({
      plan: plan ? { title: library.getBook(bookId).title, dailyMinutes: plan.dailyMinutes } : null,
      dev: devToolsEnabled() ? { todayLabel: shortLabel(todayKey()), offset: getDayOffset() } : null,
      versionText: versionText()
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
  onResetDay() { this.shiftDays(0) },

  // Trial version: tap the version line 7 times to show or hide dev tools.
  onVersionTap() {
    if (envVersion() !== 'trial' || !canUnlockDevTools()) return
    this.versionTaps++
    if (this.versionTaps < UNLOCK_TAPS) return
    this.versionTaps = 0
    const on = !devToolsEnabled()
    setDevToolsUnlocked(on)
    wx.showToast({ title: on ? '已打开开发者工具' : '已关闭开发者工具', icon: 'none' })
    this.onShow()
  },

  async onClearAll() {
    const ok = await confirm('清空所有数据？', '书、阅读计划、打卡记录、时光书签和设置都会删掉，模拟日期回到今天。', '清空')
    if (!ok) return
    wx.clearStorageSync()
    try {
      wx.getFileSystemManager().rmdirSync(wx.env.USER_DATA_PATH + '/books', true)
    } catch (err) {
      // Nothing imported yet.
    }
    wx.showToast({ title: '已清空', icon: 'success' })
    this.onShow()
  }
})

function versionText() {
  let version = ''
  try {
    version = wx.getAccountInfoSync().miniProgram.version || ''
  } catch (err) {
    // Older base libraries: no version info.
  }
  const env = VERSION_TEXT[envVersion()] || ''
  return ['日积月读', version, env].filter(Boolean).join(' · ')
}
