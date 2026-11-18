// Per-book reading plan: sessions with dates. See requirements 2.3-2.4.
//
// storage "plan:<bookId>" -> {
//   dailyMinutes,
//   sessions: [{ s, e, label, date, done, bm, sec }]
// }
//   s/e   text offsets       date  scheduled "YYYY-MM-DD"
//   done  date actually read ("YYYY-MM-DD") or null
//   bm    true if a Time Bookmark turned this late session on-time
//   sec   seconds spent reading (for future speed calibration)

const { addDays } = require('./dates')
const { splitBook } = require('./splitter')

const planKey = (bookId) => 'plan:' + bookId

function loadPlan(bookId) {
  return wx.getStorageSync(planKey(bookId)) || null
}

function savePlan(bookId, plan) {
  wx.setStorageSync(planKey(bookId), plan)
}

function removePlan(bookId) {
  wx.removeStorageSync(planKey(bookId))
}

function toSessions(split, firstDate) {
  return split.map((x, i) => ({
    s: x.start, e: x.end, label: x.label, date: addDays(firstDate, i), done: null, bm: false, sec: 0
  }))
}

function createPlan(text, chapters, dailyMinutes, startDate) {
  return { dailyMinutes, sessions: toSessions(splitBook(text, chapters, dailyMinutes), startDate) }
}

/**
 * State of one session on `today`:
 * upcoming | today | overdue (unread) or onTime | late (read).
 */
function sessionState(s, today) {
  if (s.done) return s.bm || s.done <= s.date ? 'onTime' : 'late'
  if (s.date > today) return 'upcoming'
  return s.date === today ? 'today' : 'overdue'
}

function lastIndex(arr, pred) {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i
  return -1
}

/** Index of the session scheduled for `today`, or -1. */
function todayIndex(plan, today) {
  return plan.sessions.findIndex((s) => s.date === today)
}

function overdueIndexes(plan, today) {
  const out = []
  plan.sessions.forEach((s, i) => { if (!s.done && s.date < today) out.push(i) })
  return out
}

/**
 * The session suggested for reading ahead on the home page: the first unread
 * future session, once today's session (if any) is done. Any future session
 * can still be opened from the calendar.
 */
function nextAheadIndex(plan, today) {
  const t = todayIndex(plan, today)
  if (t !== -1 && !plan.sessions[t].done) return -1
  return plan.sessions.findIndex((s) => !s.done && s.date > today)
}

/** How a session may be opened: read | reread. Reading ahead is allowed in any order. */
function openMode(plan, index) {
  return plan.sessions[index].done ? 'reread' : 'read'
}

/** Number of sessions already read whose date is still in the future. */
function aheadCount(plan, today) {
  return plan.sessions.filter((s) => s.done && s.date > today).length
}

function isFinished(plan) {
  return plan.sessions.every((s) => s.done)
}

/**
 * Reset the schedule around today:
 * - sessions read ahead move back to the day they were actually read;
 * - every unread session moves to consecutive dates from today, skipping
 *   dates already taken by read sessions.
 * Fixes both falling behind and reading far ahead. Also used when resuming a book.
 */
function reschedule(plan, today) {
  plan.sessions.forEach((s) => {
    if (s.done && s.date > today) s.date = s.done
  })
  const taken = new Set(plan.sessions.filter((s) => s.done).map((s) => s.date))
  let date = today
  plan.sessions.forEach((s) => {
    if (s.done) return
    while (taken.has(date)) date = addDays(date, 1)
    s.date = date
    date = addDays(date, 1)
  })
  return plan
}

/**
 * Change daily minutes: keep everything up to the last read session and
 * re-split the rest, scheduled from today (or the day after the last read one).
 */
function changeDailyMinutes(plan, text, chapters, minutes, today) {
  const last = lastIndex(plan.sessions, (s) => s.done)
  const kept = plan.sessions.slice(0, last + 1)
  const fromOffset = last === -1 ? 0 : kept[last].e
  const lastDate = last === -1 ? null : kept[last].date
  const firstDate = lastDate && lastDate >= today ? addDays(lastDate, 1) : today
  plan.sessions = kept.concat(toSessions(splitBook(text, chapters, minutes, fromOffset), firstDate))
  plan.dailyMinutes = minutes
  return plan
}

module.exports = {
  loadPlan, savePlan, removePlan, createPlan,
  sessionState, todayIndex, overdueIndexes, nextAheadIndex, openMode, aheadCount, isFinished,
  reschedule, changeDailyMinutes
}
