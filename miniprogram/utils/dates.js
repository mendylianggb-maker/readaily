// Local calendar dates as "YYYY-MM-DD" keys.

const pad = (n) => (n < 10 ? '0' + n : '' + n)

function toKey(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function todayKey() {
  return toKey(new Date())
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

module.exports = { toKey, fromKey, todayKey, addDays, diffDays, shortLabel, weekStart }
