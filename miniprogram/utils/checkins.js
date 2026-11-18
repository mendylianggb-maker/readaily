// Global check-ins, streaks, and Time Bookmark cards. See requirements 2.5.
//
// storage "checkins" -> { "YYYY-MM-DD": 1, ... }  days that count for the streak
// storage "rewards"  -> { cards, runStart, runAwarded, explained }
// Check-ins are global and survive book deletion.

const { addDays } = require('./dates')

const STREAK_FOR_CARD = 14
const MAX_CARDS = 3

function loadCheckins() {
  return wx.getStorageSync('checkins') || {}
}

function loadRewards() {
  return Object.assign({ cards: 0, runStart: '', runAwarded: 0, explained: false }, wx.getStorageSync('rewards') || {})
}

function saveRewards(r) {
  wx.setStorageSync('rewards', r)
}

/**
 * Record a finished session. A session read ahead also pre-credits its own
 * date, so the streak survives days away (e.g. a trip).
 */
function recordCheckin(today, sessionDate) {
  const c = loadCheckins()
  c[today] = 1
  if (sessionDate > today) c[sessionDate] = 1
  wx.setStorageSync('checkins', c)
}

/** Current streak and the date it started. Today not read yet does not break it. */
function streakInfo(today, checkins) {
  const c = checkins || loadCheckins()
  let d = c[today] ? today : addDays(today, -1)
  let length = 0
  let start = ''
  while (c[d]) {
    length++
    start = d
    d = addDays(d, -1)
  }
  return { length, start, checkedToday: !!c[today] }
}

function totalDays(today, checkins) {
  const c = checkins || loadCheckins()
  return Object.keys(c).filter((d) => d <= today).length
}

/** Award cards for every 14 streak days in the current run. Returns the number of new cards. */
function updateRewards(today) {
  const { length, start } = streakInfo(today)
  const r = loadRewards()
  if (length === 0) return 0
  if (r.runStart !== start) {
    r.runStart = start
    r.runAwarded = 0
  }
  const earned = Math.floor(length / STREAK_FOR_CARD)
  let added = 0
  while (r.runAwarded < earned) {
    r.runAwarded++
    if (r.cards < MAX_CARDS) {
      r.cards++
      added++
    }
  }
  saveRewards(r)
  return added
}

/** Days into the current run toward the next card, e.g. 9 (of 14). */
function cardProgress(today) {
  return streakInfo(today).length % STREAK_FOR_CARD
}

function useCard() {
  const r = loadRewards()
  if (r.cards <= 0) return false
  r.cards--
  saveRewards(r)
  return true
}

function markExplained() {
  const r = loadRewards()
  r.explained = true
  saveRewards(r)
}

module.exports = {
  STREAK_FOR_CARD, MAX_CARDS,
  loadCheckins, loadRewards, recordCheckin, streakInfo, totalDays,
  updateRewards, cardProgress, useCard, markExplained
}
