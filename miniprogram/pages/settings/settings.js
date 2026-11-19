const library = require('../../utils/library')
const backup = require('../../utils/backup')
const { readFileAsArrayBuffer } = require('../../utils/file')
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
    versionText: '',
    lastBackup: ''
  },

  versionTaps: 0,

  onShow() {
    const bookId = library.getCurrentBookId()
    const plan = bookId ? plans.loadPlan(bookId) : null
    this.setData({
      plan: plan ? { title: library.getBook(bookId).title, dailyMinutes: plan.dailyMinutes } : null,
      dev: devToolsEnabled() ? { todayLabel: shortLabel(todayKey()), offset: getDayOffset() } : null,
      versionText: versionText(),
      lastBackup: backup.lastBackupTime() ? formatTime(backup.lastBackupTime()) : ''
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

  // --- Backup and restore ---
  // Kept synchronous up to shareFileMessage, which needs the tap that started it.
  onBackup() {
    if (!wx.shareFileMessage) {
      wx.showModal({ title: '微信版本太旧', content: '请把微信更新到最新版本后再备份。', showCancel: false })
      return
    }
    const fs = wx.getFileSystemManager()
    const dir = wx.env.USER_DATA_PATH + '/backup'
    const filePath = dir + '/readaily-backup.zip'
    wx.showLoading({ title: '正在打包', mask: true })
    try {
      const { data } = backup.createBackup()
      fs.mkdirSync(dir, true)
      fs.writeFileSync(filePath, data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      wx.showModal({ title: '备份失败', content: '手机存储空间可能不够了。', showCancel: false })
      return
    }
    wx.hideLoading()
    wx.shareFileMessage({
      filePath,
      fileName: '日积月读备份-' + todayKey() + '.zip',
      success: () => {
        backup.markBackedUp()
        this.onShow()
        wx.showToast({ title: '已发送', icon: 'success' })
      },
      complete: () => {
        try { fs.unlinkSync(filePath) } catch (err) { /* already gone */ }
      }
    })
  },

  async onRestore() {
    let file
    try {
      file = await new Promise((resolve, reject) => wx.chooseMessageFile({
        count: 1, type: 'file', extension: ['zip'],
        success: (res) => resolve(res.tempFiles[0]), fail: reject
      }))
    } catch (err) {
      return // Cancelled.
    }
    let found
    wx.showLoading({ title: '正在读取', mask: true })
    try {
      found = backup.readBackup(await readFileAsArrayBuffer(file.path))
    } catch (err) {
      wx.hideLoading()
      wx.showModal({ title: '无法恢复', content: err.message || '文件读取失败', showCancel: false })
      return
    }
    wx.hideLoading()
    const ok = await confirm(
      '用这个备份替换现在的数据？',
      '备份时间：' + formatTime(found.createdAt) + '，共 ' + found.bookCount + ' 本书。\n\n' +
        '这台手机上现在的书、阅读计划、打卡记录和设置都会被替换，替换后不能撤销。',
      '恢复'
    )
    if (!ok) return
    wx.showLoading({ title: '正在恢复', mask: true })
    try {
      backup.restoreBackup(found)
      backup.markBackedUp()
    } catch (err) {
      console.error(err)
      wx.hideLoading()
      wx.showModal({ title: '恢复失败', content: '手机存储空间可能不够了，清理后再试一次。', showCancel: false })
      return
    }
    wx.hideLoading()
    wx.showToast({ title: '已恢复', icon: 'success' })
    setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 800)
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

function formatTime(ms) {
  const d = new Date(ms)
  const pad = (n) => (n < 10 ? '0' + n : '' + n)
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

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
