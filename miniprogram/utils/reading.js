// High-level reading flows used by pages: starting/switching books,
// finishing sessions, and building the views for home and calendar.

const library = require('./library')
const plans = require('./plan')
const checkins = require('./checkins')
const { todayKey, addDays, weekStart, shortLabel } = require('./dates')

/**
 * Start reading a book (new or paused). The current book, if different, is paused.
 * A new book gets a plan from today; a paused book is rescheduled from today.
 */
function startBook(bookId, dailyMinutes) {
  const today = todayKey()
  const current = library.getCurrentBookId()
  if (current && current !== bookId) library.updateBook(current, { status: 'paused' })

  let plan = plans.loadPlan(bookId)
  if (plan) {
    plans.reschedule(plan, today)
    checkins.removeFutureCheckins(today)
  } else {
    const detail = library.getBookDetail(bookId)
    plan = plans.createPlan(library.readBookText(bookId), detail.chapters, dailyMinutes, today)
  }
  plans.savePlan(bookId, plan)
  library.updateBook(bookId, { status: 'reading' })
  library.setCurrentBookId(bookId)
  return plan
}

/**
 * Mark a session as read.
 * @returns {{ streak: number, newCards: number, bookFinished: boolean }}
 */
function finishSession(bookId, index, seconds) {
  const today = todayKey()
  const plan = plans.loadPlan(bookId)
  const s = plan.sessions[index]
  if (!s.done) {
    s.done = today
    s.sec = (s.sec || 0) + seconds
    checkins.recordCheckin(today, s.date)
  }
  plans.savePlan(bookId, plan)

  const newCards = checkins.updateRewards(today)
  const bookFinished = plans.isFinished(plan)
  if (bookFinished) {
    library.updateBook(bookId, { status: 'finished', finishedAt: Date.now() })
    library.setCurrentBookId('')
  }
  return { streak: checkins.streakInfo(today).length, newCards, bookFinished }
}

function rescheduleBook(bookId) {
  const today = todayKey()
  const plan = plans.loadPlan(bookId)
  plans.reschedule(plan, today)
  plans.savePlan(bookId, plan)
  checkins.removeFutureCheckins(today)
}

/** Read a finished book again: a fresh plan from today. Check-ins are kept. */
function restartBook(bookId, dailyMinutes) {
  plans.removePlan(bookId)
  wx.removeStorageSync('progress:' + bookId)
  return startBook(bookId, dailyMinutes)
}

const RESCHEDULE_AT = 7

/** Whether to offer Reschedule, and why: 'behind' | 'ahead' | ''. */
function rescheduleReason(plan, today) {
  if (plans.overdueIndexes(plan, today).length >= RESCHEDULE_AT) return 'behind'
  if (plans.aheadCount(plan, today) >= RESCHEDULE_AT) return 'ahead'
  return ''
}

function changeDailyMinutes(bookId, minutes) {
  const plan = plans.loadPlan(bookId)
  const detail = library.getBookDetail(bookId)
  plans.changeDailyMinutes(plan, library.readBookText(bookId), detail.chapters, minutes, todayKey())
  plans.savePlan(bookId, plan)
}

/** Use a Time Bookmark on a late session. */
function bookmarkSession(bookId, index) {
  const today = todayKey()
  const plan = plans.loadPlan(bookId)
  const s = plan.sessions[index]
  if (plans.sessionState(s, today) !== 'late') return false
  if (!checkins.useCard()) return false
  s.bm = true
  plans.savePlan(bookId, plan)
  return true
}

/** date -> { index, state } for the current plan. */
function dateMap(plan, today) {
  const map = {}
  plan.sessions.forEach((s, i) => { map[s.date] = { index: i, state: plans.sessionState(s, today) } })
  return map
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

/** Everything the home page shows. */
function homeView() {
  const today = todayKey()
  const newCards = checkins.updateRewards(today)
  const rewards = checkins.loadRewards()
  const streak = checkins.streakInfo(today)
  const bookId = library.getCurrentBookId()
  const book = bookId ? library.getBook(bookId) : null
  const base = {
    today,
    todayLabel: shortLabel(today),
    streak: streak.length,
    cards: rewards.cards,
    newCards,
    hasBooks: library.listBooks().length > 0,
    book: null
  }
  if (!book) return base

  const plan = plans.loadPlan(bookId)
  const t = plans.todayIndex(plan, today)
  const overdue = plans.overdueIndexes(plan, today)
  const ahead = plans.nextAheadIndex(plan, today)
  const map = dateMap(plan, today)
  const monday = weekStart(today)
  const week = WEEKDAYS.map((name, i) => {
    const date = addDays(monday, i)
    const m = map[date]
    return { name, date, day: Number(date.slice(8)), state: m ? m.state : 'none', isToday: date === today }
  })
  const done = plan.sessions.filter((s) => s.done).length

  return Object.assign(base, {
    book: { id: book.id, title: book.title, coverPath: book.coverPath },
    dailyMinutes: plan.dailyMinutes,
    totalSessions: plan.sessions.length,
    progress: Math.round((done / plan.sessions.length) * 100),
    todaySession: t === -1 ? null : {
      index: t,
      day: t + 1,
      label: plan.sessions[t].label,
      done: !!plan.sessions[t].done
    },
    overdueCount: overdue.length,
    firstOverdue: overdue.length ? overdue[0] : -1,
    firstOverdueLabel: overdue.length ? shortLabel(plan.sessions[overdue[0]].date) : '',
    rescheduleReason: rescheduleReason(plan, today),
    aheadCount: plans.aheadCount(plan, today),
    aheadIndex: ahead,
    aheadLabel: ahead === -1 ? '' : shortLabel(plan.sessions[ahead].date),
    week
  })
}

module.exports = {
  startBook, restartBook, finishSession, rescheduleBook, rescheduleReason, changeDailyMinutes,
  bookmarkSession, dateMap, homeView
}
