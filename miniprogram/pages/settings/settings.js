const { loadSettings, saveSettings, readerStyle } = require('../../utils/settings')
const library = require('../../utils/library')
const plans = require('../../utils/plan')
const reading = require('../../utils/reading')
const { MINUTE_OPTIONS, confirm } = require('../../utils/ui')

Page({
  data: {
    settings: null,
    style: null,
    sizeOptions: ['小', '中', '大', '特大'],
    lineOptions: ['紧凑', '适中', '宽松'],
    fontOptions: [{ value: 'sans', label: '无衬线' }, { value: 'serif', label: '衬线' }],
    themeOptions: [
      { value: 'auto', label: '跟随系统' },
      { value: 'light', label: '白色' },
      { value: 'sepia', label: '护眼' },
      { value: 'dark', label: '夜间' }
    ],
    minuteOptions: MINUTE_OPTIONS,
    plan: null // { title, dailyMinutes }
  },

  onShow() {
    const settings = loadSettings()
    const bookId = library.getCurrentBookId()
    const plan = bookId ? plans.loadPlan(bookId) : null
    this.setData({
      settings,
      style: readerStyle(settings),
      plan: plan ? { title: library.getBook(bookId).title, dailyMinutes: plan.dailyMinutes } : null
    })
  },

  update(patch) {
    const settings = Object.assign({}, this.data.settings, patch)
    saveSettings(settings)
    this.setData({ settings, style: readerStyle(settings) })
  },

  onSize(e) { this.update({ fontSize: Number(e.currentTarget.dataset.value) }) },
  onLine(e) { this.update({ lineHeight: Number(e.currentTarget.dataset.value) }) },
  onFont(e) { this.update({ font: e.currentTarget.dataset.value }) },
  onTheme(e) { this.update({ theme: e.currentTarget.dataset.value }) },

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
  }
})
