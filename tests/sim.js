// Simulates several weeks of use with a mocked wx and clock.
// Run from the repo root: node tests/sim.js
const fs = require('fs'), path = require('path'), os = require('os')
const ROOT = path.join(__dirname, '..'), TMP = path.join(os.tmpdir(), 'readaily-sim')
fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true })
const RealDate = Date
let NOW = new RealDate(2026, 10, 1, 9).getTime()
global.Date = class extends RealDate { constructor(...a) { a.length ? super(...a) : super(NOW) } static now() { return NOW } }
const setDay = (key) => { const [y, m, d] = key.split('-').map(Number); NOW = new RealDate(y, m - 1, d, 9).getTime() }
const store = {}
global.wx = { env: { USER_DATA_PATH: TMP },
  getStorageSync: k => store[k] === undefined ? '' : JSON.parse(store[k]), setStorageSync: (k, v) => { store[k] = JSON.stringify(v) }, removeStorageSync: k => { delete store[k] },
  getFileSystemManager: () => ({ mkdirSync: (p, r) => fs.mkdirSync(p, { recursive: r }), writeFileSync: (p, d, e) => fs.writeFileSync(p, typeof d === 'string' ? d : Buffer.from(d), e), readFileSync: (p, e) => fs.readFileSync(p, e), rmdirSync: (p, r) => fs.rmSync(p, { recursive: r }) }) }
const U = (m) => require(path.join(ROOT, 'miniprogram/utils', m))
const lib = U('library'), reading = U('reading'), plans = U('plan'), ck = U('checkins'), { parseTxt } = U('txt-parser')

// Synthetic book: 20 chapters of about 6000 CJK characters (about 290 minutes).
const SENTENCES = ['海风吹过小镇的屋顶。', '灯塔的光扫过黑色的海面。', '远处的渔船慢慢靠岸。', '她在笔记本上写下今天的天气。']
let text = ''
for (let ch = 1; ch <= 20; ch++) {
  text += '第' + ch + '章\n'
  for (let para = 0; para < 55; para++) {
    let line = ''
    for (let k = 0; k < 10; k++) line += SENTENCES[(ch + para + k) % SENTENCES.length]
    text += line + '\n'
  }
}
const p = parseTxt(text, 'a.txt')
const A = lib.addBook({ text, parsed: p, title: 'A', author: '', format: 'txt' }).id
let ok = 0, fail = 0
const check = (name, cond) => { cond ? ok++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name) }
const st = (id, i) => plans.sessionState(plans.loadPlan(id).sessions[i], new Date().toISOString() && require(path.join(ROOT, 'miniprogram/utils/dates')).todayKey())

setDay('2026-11-01'); reading.startBook(A, 5)
let plan = plans.loadPlan(A)
check('plan starts today, one session per day', plan.sessions[0].date === '2026-11-01' && plan.sessions[1].date === '2026-11-02')
check('5-minute plan has more sessions than 10-minute estimate', plan.sessions.length > 12)
reading.finishSession(A, 0, 300)
check('day 1 read on time', st(A, 0) === 'onTime')
check('streak 1', ck.streakInfo('2026-11-01').length === 1)

setDay('2026-11-03') // 11/02 skipped
check('11/02 overdue', st(A, 1) === 'overdue')
check('home suggests no read-ahead before today is done', plans.nextAheadIndex(plans.loadPlan(A), '2026-11-03') === -1)
check('but any future session can be opened to read', plans.openMode(plans.loadPlan(A), 5) === 'read')
check('missed day breaks the streak', ck.streakInfo('2026-11-03').length === 0)
reading.finishSession(A, 1, 300) // catch up 11/02 first
check('catch-up is late (yellow)', st(A, 1) === 'late')
check('catch-up counts today only: streak 1, total 2', ck.streakInfo('2026-11-03').length === 1 && ck.totalDays('2026-11-03') === 2)
check('today is still unread after catching up', st(A, 2) === 'today')
reading.finishSession(A, 2, 300)
check('reading today too keeps streak 1, total 2', ck.streakInfo('2026-11-03').length === 1 && ck.totalDays('2026-11-03') === 2)
check('home suggests the next future session', plans.nextAheadIndex(plans.loadPlan(A), '2026-11-03') === 3)
reading.finishSession(A, 3, 300) // read 11/04 ahead
check('read-ahead counts as on time', st(A, 3) === 'onTime')

setDay('2026-11-04')
check('pre-credited 11/04 keeps the streak (11/03 + 11/04)', ck.streakInfo('2026-11-04').length === 2)

// Read every day from 11/05 to 11/16 -> 14-day run (11/03..11/16), two cards.
for (let d = 5; d <= 16; d++) {
  const key = '2026-11-' + String(d).padStart(2, '0'); setDay(key)
  reading.finishSession(A, plans.todayIndex(plans.loadPlan(A), key), 300)
}
check('14-day streak', ck.streakInfo('2026-11-16').length === 14)
check('one Time Bookmark per 7 streak days', ck.loadRewards().cards === 2)
check('bookmark turns late into on time', reading.bookmarkSession(A, 1) && st(A, 1) === 'onTime' && ck.loadRewards().cards === 1)
check('bookmark only works on late sessions', reading.bookmarkSession(A, 1) === false && ck.loadRewards().cards === 1)

// Away for 8 days.
setDay('2026-11-25')
let hv = reading.homeView()
check('8 overdue days (11/17-11/24) -> reschedule offered', hv.overdueCount === 8 && hv.rescheduleReason === 'behind')
check('streak broken after being away', hv.streak === 0)
reading.rescheduleBook(A)
plan = plans.loadPlan(A)
const firstUnread = plan.sessions.findIndex(s => !s.done)
check('reschedule moves first unread to today', plan.sessions[firstUnread].date === '2026-11-25' && plans.overdueIndexes(plan, '2026-11-25').length === 0)

// Change daily minutes 5 -> 10.
const before = plan.sessions.length
reading.changeDailyMinutes(A, 10)
plan = plans.loadPlan(A)
const lastDone = plan.sessions.map(s => !!s.done).lastIndexOf(true)
check('change minutes keeps read sessions and re-splits the rest', plan.sessions.length < before && plan.sessions[lastDone + 1].date === '2026-11-25' && text.slice(plan.sessions[lastDone].e, plan.sessions[lastDone + 1].s).trim() === '')
check('re-split label marks a continued chapter', /（续）/.test(plan.sessions[lastDone + 1].label))

// Switch to book B, then back to A after a few days.
const B = lib.addBook({ text, parsed: p, title: 'B', author: '', format: 'txt' }).id
reading.startBook(B, 10)
check('switching pauses A', lib.getBook(A).status === 'paused' && lib.getCurrentBookId() === B)
setDay('2026-11-30')
reading.startBook(A, 10)
plan = plans.loadPlan(A)
check('resuming A reschedules unread from today (no backlog)', plans.overdueIndexes(plan, '2026-11-30').length === 0 && plan.sessions[plan.sessions.findIndex(s => !s.done)].date === '2026-11-30')

// Finish A: read all remaining sessions today (first today, then ahead in order).
let r
for (let i = 0; i < plan.sessions.length; i++) if (!plans.loadPlan(A).sessions[i].done) r = reading.finishSession(A, i, 60)
check('finishing the last session finishes the book', r.bookFinished && lib.getBook(A).status === 'finished' && lib.getCurrentBookId() === '')

// Reading far ahead, then resetting.
setDay('2026-12-01')
const C = lib.addBook({ text, parsed: p, title: 'C', author: '', format: 'txt' }).id
reading.startBook(C, 5)
for (let i = 0; i < 9; i++) reading.finishSession(C, i, 60) // today + 8 days ahead
plan = plans.loadPlan(C)
check('8 days ahead -> reschedule offered for ahead', reading.rescheduleReason(plan, '2026-12-01') === 'ahead')
check('pre-credits exist for future dates', ck.loadCheckins()['2026-12-05'] === 1)
reading.rescheduleBook(C)
plan = plans.loadPlan(C)
check('ahead reset: read sessions move back to the day read', plan.sessions.slice(0, 9).every(s => s.date === '2026-12-01'))
check('ahead reset: next unread is tomorrow', plan.sessions[9].date === '2026-12-02')
check('ahead reset: future pre-credits removed', !ck.loadCheckins()['2026-12-05'] && ck.loadCheckins()['2026-12-01'] === 1)
check('ahead reset: still on time', plans.sessionState(plan.sessions[5], '2026-12-01') === 'onTime')

// Read a finished book again.
reading.restartBook(A, 10)
plan = plans.loadPlan(A)
check('restart: fresh plan from today, A is current, C paused', plan.sessions.every(s => !s.done) && plan.sessions[0].date === '2026-12-01' && lib.getCurrentBookId() === A && lib.getBook(C).status === 'paused')

// Bookshelf line for every status, including a book that was never started.
const N = lib.addBook({ text, parsed: p, title: 'N', author: '', format: 'txt' }).id
check('shelf info for a new book shows reading time', /^约 \d+ (小时|分钟)$/.test(reading.shelfInfo(lib.getBook(N)).info))
check('shelf info for the current book shows progress', reading.shelfInfo(lib.getBook(A)).info === '0%')
lib.deleteBook(N)

// Duplicates are found by content, not title; WeChat's "(1)" suffix is dropped.
check('re-sent file name keeps the title', parseTxt(text, 'Book(1).txt').title === 'Book' && parseTxt(text, '书名（2）.txt').title === '书名')
check('same content is a duplicate even with another title', lib.findDuplicate(p.stats, p.chapters.length) !== undefined)
check('different content is not a duplicate', lib.findDuplicate({ cjk: 1, words: 0 }, 0) === undefined)

// Extras (skipped EPUB items) are stored and readable.
const E = lib.addBook({ text, parsed: p, title: 'E', author: '', format: 'epub', extras: [{ title: 'Copyright', text: 'All rights reserved.\n' }, { title: 'Index', text: 'A, B, C\n' }] })
const ex = lib.getBookDetail(E.id).extras
check('extras stored with offsets', E.extraCount === 2 && lib.readExtrasText(E.id).slice(ex[1].start, ex[1].end) === 'A, B, C\n')

// Simulated date: ignored in release, honored in develop.
const dates = U('dates')
store['debug:dayOffset'] = JSON.stringify(3)
check('simulated date ignored without a dev build', dates.todayKey() === '2026-12-01')
global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: 'develop' } })
check('simulated date honored in develop', dates.todayKey() === '2026-12-04')
global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: 'trial' } })
check('trial: simulated date ignored until dev tools are unlocked', dates.todayKey() === '2026-12-01' && !dates.devToolsEnabled())
dates.setDevToolsUnlocked(true)
check('trial: simulated date honored after unlocking', dates.todayKey() === '2026-12-04')
dates.setDevToolsUnlocked(false)
check('trial: locking again resets the simulated date', dates.todayKey() === '2026-12-01' && !store['debug:dayOffset'])
store['debug:dayOffset'] = JSON.stringify(3)
dates.setDevToolsUnlocked(true)
global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: 'release' } })
check('release: simulated date ignored even if unlocked', dates.todayKey() === '2026-12-01' && !dates.devToolsEnabled() && !dates.canUnlockDevTools())
dates.setDevToolsUnlocked(false)
delete global.wx.getAccountInfoSync

// Cards cap at 3.
store.checkins = JSON.stringify({}); store.rewards = JSON.stringify({ cards: 3, runStart: '', runAwarded: 0 })
const c = {}; for (let i = 0; i < 14; i++) { const d = new RealDate(2026, 11, 1 + i); c[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')] = 1 }
store.checkins = JSON.stringify(c)
check('no new card while holding 3', ck.updateRewards('2026-12-14') === 0 && ck.loadRewards().cards === 3)

lib.deleteBook(B)
check('deleting a book keeps check-ins', Object.keys(ck.loadCheckins()).length === 14 && !store['plan:' + B])
console.log('\n' + ok + ' passed, ' + fail + ' failed')
