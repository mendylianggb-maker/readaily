const library = require('../../utils/library')
const plans = require('../../utils/plan')
const reading = require('../../utils/reading')
const checkins = require('../../utils/checkins')
const { loadSettings, saveSettings, readerStyle } = require('../../utils/settings')
const { todayKey, shortLabel } = require('../../utils/dates')
const { countUnits, readingMinutes } = require('../../utils/text-stats')
const { BOOKMARK_EXPLAINER } = require('../../utils/ui')

const SAVE_SCROLL_MS = 1000

Page({
  data: {
    loaded: false,
    header: null, // { dateText, dayText, minutes, label, progress } or { title } for extras
    blocks: [], // { type: 'h' | 'p', text }
    mode: 'read', // read | reread | extra
    finishText: '',
    settings: null,
    style: null,
    panel: false, // Aa settings panel
    sizeOptions: ['小', '中', '大', '特大'],
    lineOptions: ['紧凑', '适中', '宽松'],
    fontOptions: [{ value: 'sans', label: '无衬线' }, { value: 'serif', label: '衬线' }],
    themeOptions: [
      { value: 'auto', label: '跟随系统' },
      { value: 'light', label: '白色' },
      { value: 'sepia', label: '护眼' },
      { value: 'dark', label: '夜间' }
    ],
    result: null // shown after finishing
  },

  bookId: '',
  index: 0,
  startedAt: 0,
  seconds: 0,
  lastScrollSave: 0,

  onLoad(options) {
    this.bookId = options.bookId
    if (options.extra !== undefined) this.loadExtra(Number(options.extra))
    else {
      this.index = Number(options.index)
      this.load()
    }
  },

  onShow() {
    this.applyStyle()
    this.startedAt = Date.now()
    wx.setKeepScreenOn({ keepScreenOn: true })
  },

  onHide() {
    this.pauseTimer()
  },

  onUnload() {
    this.pauseTimer()
    wx.setKeepScreenOn({ keepScreenOn: false })
  },

  pauseTimer() {
    if (this.startedAt) this.seconds += Math.round((Date.now() - this.startedAt) / 1000)
    this.startedAt = 0
  },

  fail() {
    wx.showToast({ title: '找不到这段内容', icon: 'none' })
    setTimeout(() => wx.navigateBack(), 800)
  },

  load() {
    const today = todayKey()
    const book = library.getBook(this.bookId)
    const plan = plans.loadPlan(this.bookId)
    if (!book || !plan || !plan.sessions[this.index]) return this.fail()
    const session = plan.sessions[this.index]
    const text = library.readBookText(this.bookId)
    const chapters = library.getBookDetail(this.bookId).chapters
    const state = plans.sessionState(session, today)
    const done = plan.sessions.filter((s) => s.done).length

    wx.setNavigationBarTitle({ title: book.title })
    this.setData({
      loaded: true,
      mode: plans.openMode(plan, this.index),
      header: {
        dateText: shortLabel(session.date),
        dayText: '第 ' + (this.index + 1) + ' 天',
        minutes: Math.max(1, Math.round(readingMinutes(countUnits(text.slice(session.s, session.e))))),
        label: session.label,
        progress: Math.round((done / plan.sessions.length) * 100)
      },
      blocks: buildBlocks(text, chapters, session),
      finishText: state === 'overdue' ? '完成补读' : state === 'upcoming' ? '完成提前阅读' : '完成今天的阅读'
    })

    // Restore the scroll position if this session was left mid-way.
    const progress = wx.getStorageSync('progress:' + this.bookId)
    if (progress && progress.index === this.index && progress.top > 0) {
      setTimeout(() => wx.pageScrollTo({ scrollTop: progress.top, duration: 0 }), 50)
    }
  },

  // Skipped EPUB content (cover page, index, ...): read-only, no check-in.
  loadExtra(i) {
    const book = library.getBook(this.bookId)
    const detail = library.getBookDetail(this.bookId)
    const extra = detail && detail.extras && detail.extras[i]
    if (!book || !extra) return this.fail()
    const text = library.readExtrasText(this.bookId).slice(extra.start, extra.end)
    wx.setNavigationBarTitle({ title: book.title })
    this.setData({
      loaded: true,
      mode: 'extra',
      header: { title: extra.title },
      blocks: text.split('\n').map((t) => t.trim()).filter(Boolean).map((t) => ({ type: 'p', text: t }))
    })
  },

  applyStyle() {
    const settings = loadSettings()
    const style = readerStyle(settings)
    this.setData({ settings, style })
    wx.setNavigationBarColor({ frontColor: style.theme.navText, backgroundColor: style.theme.nav })
    wx.setBackgroundColor({ backgroundColor: style.theme.bg })
  },

  onPageScroll(e) {
    if (this.data.mode === 'extra') return
    const now = Date.now()
    if (now - this.lastScrollSave < SAVE_SCROLL_MS) return
    this.lastScrollSave = now
    wx.setStorageSync('progress:' + this.bookId, { index: this.index, top: e.scrollTop })
  },

  // --- Aa panel ---
  onTogglePanel() {
    this.setData({ panel: !this.data.panel })
  },

  updateSettings(patch) {
    saveSettings(Object.assign({}, this.data.settings, patch))
    this.applyStyle()
  },

  onSize(e) { this.updateSettings({ fontSize: Number(e.currentTarget.dataset.value) }) },
  onLine(e) { this.updateSettings({ lineHeight: Number(e.currentTarget.dataset.value) }) },
  onFont(e) { this.updateSettings({ font: e.currentTarget.dataset.value }) },
  onTheme(e) { this.updateSettings({ theme: e.currentTarget.dataset.value }) },

  // --- finishing ---
  onFinish() {
    this.pauseTimer()
    const result = reading.finishSession(this.bookId, this.index, this.seconds)
    this.seconds = 0
    wx.removeStorageSync('progress:' + this.bookId)
    if (result.bookFinished) {
      wx.redirectTo({ url: '/pages/finish/finish?bookId=' + this.bookId })
      return
    }
    const plan = plans.loadPlan(this.bookId)
    const today = todayKey()
    const ahead = plans.nextAheadIndex(plan, today)
    const overdue = plans.overdueIndexes(plan, today)
    this.setData({
      mode: 'reread',
      result: {
        streak: result.streak,
        newCards: result.newCards,
        aheadIndex: ahead,
        aheadLabel: ahead === -1 ? '' : shortLabel(plan.sessions[ahead].date),
        overdueIndex: overdue.length ? overdue[0] : -1
      }
    })
    // First card ever: explain what it is.
    if (result.newCards > 0 && !checkins.loadRewards().explained) {
      checkins.markExplained()
      wx.showModal({ title: '获得一张时光书签 🔖', content: BOOKMARK_EXPLAINER, showCancel: false, confirmText: '知道了' })
    }
  },

  openSession(index) {
    wx.redirectTo({ url: '/pages/reader/reader?bookId=' + this.bookId + '&index=' + index })
  },

  onReadAhead() {
    this.openSession(this.data.result.aheadIndex)
  },

  onCatchUp() {
    this.openSession(this.data.result.overdueIndex)
  },

  onBack() {
    wx.navigateBack()
  },

  // Keep sheets from closing when tapping inside them.
  noop() {}
})

/** Paragraphs of a session, with inline titles where a chapter starts. */
function buildBlocks(text, chapters, session) {
  const blocks = []
  for (const ch of chapters) {
    if (ch.end <= session.s || ch.start >= session.e) continue
    const from = Math.max(ch.start, session.s)
    const to = Math.min(ch.end, session.e)
    const startsHere = !text.slice(ch.start, session.s).trim()
    if (startsHere && chapters.length > 1) blocks.push({ type: 'h', text: ch.title })
    text.slice(from, to).split('\n').forEach((line) => {
      const t = line.trim()
      if (t) blocks.push({ type: 'p', text: t })
    })
  }
  return blocks
}
