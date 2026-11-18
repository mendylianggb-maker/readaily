// Local calendar dates as "YYYY-MM-DD" keys.

const pad = (n) => (n < 10 ? '0' + n : '' + n)

function toKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Simulated date for development: a day offset stored locally.
// Dev tools are always on in the develop version (DevTools, preview QR codes),
// hidden in the trial version until unlocked on the settings page, and never
// available in the released mini program.
const DAY_OFFSET_KEY = 'debug:dayOffset'
const UNLOCK_KEY = 'debug:unlocked'

function envVersion() {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion
  } catch (err) {
    return 'release'
  }
}

/** Whether dev tools can be unlocked at all (not in release). */
function canUnlockDevTools() {
  const v = envVersion()
  return v === 'develop' || v === 'trial'
}

function devToolsEnabled() {
  const v = envVersion()
  if (v === 'develop') return true
  if (v !== 'trial') return false
  try {
    return !!wx.getStorageSync(UNLOCK_KEY)
  } catch (err) {
    return false
  }
}

/** Turn trial-version dev tools on or off. Turning off also resets the simulated date. */
function setDevToolsUnlocked(on) {
  if (on) wx.setStorageSync(UNLOCK_KEY, 1)
  else {
    wx.removeStorageSync(UNLOCK_KEY)
    wx.removeStorageSync(DAY_OFFSET_KEY)
  }
}

function getDayOffset() {
  if (!devToolsEnabled()) return 0
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
  envVersion, canUnlockDevTools, devToolsEnabled, setDevToolsUnlocked, getDayOffset, setDayOffset
}
