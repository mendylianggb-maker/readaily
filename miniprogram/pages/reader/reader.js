const library = require('../../utils/library')
const plans = require('../../utils/plan')
const reading = require('../../utils/reading')
const checkins = require('../../utils/checkins')
const { BOOKMARK_EXPLAINER } = require('../../utils/ui')
const { loadSettings, readerStyle } = require('../../utils/settings')
const { todayKey, shortLabel } = require('../../utils/dates')
const { countUnits, readingMinutes } = require('../../utils/text-stats')

const SAVE_SCROLL_MS = 1000

Page({
  data: {
    loaded: false,
    header: null, // { dateText, dayText, minutes, label, progress }
    blocks: [], // { type: 'h' | 'p', text }
    mode: 'read', // read | reread | preview
    finishText: '',
    previewHint: '',
    style: null,
    result: null // shown after finishing: { streak, newCards }
  },

  bookId: '',
  index: 0,
  startedAt: 0,
  seconds: 0,
  lastScrollSave: 0,

  onLoad(options) {
    this.bookId = options.bookId
    this.index = Number(options.index)
    this.load()
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

  load() {
    const today = todayKey()
    const book = library.getBook(this.bookId)
    const plan = plans.loadPlan(this.bookId)
    if (!book || !plan || !plan.sessions[this.index]) {
      wx.showToast({ title: '找不到这段内容', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    const session = plan.sessions[this.index]
    const text = library.readBookText(this.bookId)
    const chapters = library.getBookDetail(this.bookId).chapters
    const mode = plans.openMode(plan, this.index, today)
    const state = plans.sessionState(session, today)
    const done = plan.sessions.filter((s) => s.done).length
    const ahead = plans.nextAheadIndex(plan, today)

    wx.setNavigationBarTitle({ title: book.title })
    this.setData({
      loaded: true,
      mode,
      header: {
        dateText: shortLabel(session.date),
        dayText: '第 ' + (this.index + 1) + ' 天',
        minutes: Math.max(1, Math.round(readingMinutes(countUnits(text.slice(session.s, session.e))))),
        label: session.label,
        progress: Math.round((done / plan.sessions.length) * 100)
      },
      blocks: buildBlocks(text, chapters, session),
      finishText: state === 'overdue' ? '完成补读' : state === 'upcoming' ? '完成提前阅读' : '完成今天的阅读',
      previewHint: mode === 'preview' && ahead !== -1
        ? '提前读要按顺序，下一段是 ' + shortLabel(plan.sessions[ahead].date) + ' 的'
        : '这一段还没到时间，先看看就好'
    })

    // Restore the scroll position if this session was left mid-way.
    const progress = wx.getStorageSync('progress:' + this.bookId)
    if (progress && progress.index === this.index && progress.top > 0) {
      setTimeout(() => wx.pageScrollTo({ scrollTop: progress.top, duration: 0 }), 50)
    }
  },

  applyStyle() {
    const style = readerStyle(loadSettings())
    this.setData({ style })
    wx.setNavigationBarColor({
      frontColor: style.theme.navText,
      backgroundColor: style.theme.nav
    })
    wx.setBackgroundColor({ backgroundColor: style.theme.bg })
  },

  onPageScroll(e) {
    const now = Date.now()
    if (now - this.lastScrollSave < SAVE_SCROLL_MS) return
    this.lastScrollSave = now
    wx.setStorageSync('progress:' + this.bookId, { index: this.index, top: e.scrollTop })
  },

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

  onSettings() {
    wx.navigateTo({ url: '/pages/settings/settings' })
  },

  // Keep the result sheet from closing when tapping inside it.
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
