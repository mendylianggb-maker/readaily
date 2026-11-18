// Local calendar dates as "YYYY-MM-DD" keys.

const pad = (n) => (n < 10 ? '0' + n : '' + n)

function toKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Simulated date for development: a day offset stored locally, only honored
// in the develop/trial versions, never in the released mini program.
const DAY_OFFSET_KEY = 'debug:dayOffset'

function isDevBuild() {
  try {
    const v = wx.getAccountInfoSync().miniProgram.envVersion
    return v === 'develop' || v === 'trial'
  } catch (err) {
    return false
  }
}

function getDayOffset() {
  if (!isDevBuild()) return 0
  try {
    return Number(wx.getStorageSync(DAY_OFFSET_KEY)) || 0
  } catch (err) {
    return 0
  }
}

function setDayOffset(n) {
  wx.setStorageSync(DAY_OFFSET_KEY, n)
}

function todayKey() {
  const key = toKey(new Date())
  const offset = getDayOffset()
  return offset ? addDays(key, offset) : key
}

function addDays(key, n) {
  const d = fromKey(key)
  d.setDate(d.getDate() + n)
  return toKey(d)
}

/** Whole days from a to b (b - a). */
function diffDays(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000)
}

/** "11/17" */
function shortLabel(key) {
  const d = fromKey(key)
  return d.getMonth() + 1 + '/' + d.getDate()
}

/** Monday of the week containing `key`. */
function weekStart(key) {
  const d = fromKey(key)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return toKey(d)
}

module.exports = {
  toKey, fromKey, todayKey, addDays, diffDays, shortLabel, weekStart,
  isDevBuild, getDayOffset, setDayOffset
}
