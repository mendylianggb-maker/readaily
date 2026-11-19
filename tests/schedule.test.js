// Reading plans: splitting, daily states, catching up, rescheduling, switching and finishing books.
const { setDay, load, TEXT, addSampleBook, stateOf: st, section, check } = require('./harness')
const lib = load('library'), reading = load('reading'), plans = load('plan')

section('Starting a plan')
setDay('2026-11-01')
const A = addSampleBook('A')
reading.startBook(A, 5)
let plan = plans.loadPlan(A)
check('plan starts today, one session per day', plan.sessions[0].date === '2026-11-01' && plan.sessions[1].date === '2026-11-02')
check('5-minute plan has more sessions than a 10-minute estimate', plan.sessions.length > 12)
reading.finishSession(A, 0, 300)
check('session read on its day is on time', st(A, 0) === 'onTime')

section('Missing a day and catching up')
setDay('2026-11-03') // 11/02 skipped
check('skipped day is overdue', st(A, 1) === 'overdue')
check('home suggests no read-ahead before today is done', plans.nextAheadIndex(plans.loadPlan(A), '2026-11-03') === -1)
check('any future session can still be opened', plans.openMode(plans.loadPlan(A), 5) === 'read')
reading.finishSession(A, 1, 300)
check('catch-up is late (yellow)', st(A, 1) === 'late')
check('today is still unread after catching up', st(A, 2) === 'today')
reading.finishSession(A, 2, 300)
check('after today, home suggests the next future session', plans.nextAheadIndex(plans.loadPlan(A), '2026-11-03') === 3)
reading.finishSession(A, 3, 300)
check('reading ahead counts as on time', st(A, 3) === 'onTime')

section('Rescheduling after being away')
for (let d = 5; d <= 16; d++) {
  const key = '2026-11-' + String(d).padStart(2, '0'); setDay(key)
  reading.finishSession(A, plans.todayIndex(plans.loadPlan(A), key), 300)
}
setDay('2026-11-25') // away 11/17-11/24
const hv = reading.homeView()
check('8 overdue days -> reschedule offered', hv.overdueCount === 8 && hv.rescheduleReason === 'behind')
reading.rescheduleBook(A)
plan = plans.loadPlan(A)
const firstUnread = plan.sessions.findIndex((s) => !s.done)
check('reschedule moves the first unread session to today', plan.sessions[firstUnread].date === '2026-11-25' && plans.overdueIndexes(plan, '2026-11-25').length === 0)

section('Changing daily minutes')
const before = plan.sessions.length
reading.changeDailyMinutes(A, 10)
plan = plans.loadPlan(A)
const lastDone = plan.sessions.map((s) => !!s.done).lastIndexOf(true)
check('read sessions are kept and the rest is re-split from today', plan.sessions.length < before && plan.sessions[lastDone + 1].date === '2026-11-25' && TEXT.slice(plan.sessions[lastDone].e, plan.sessions[lastDone + 1].s).trim() === '')
check('re-split label marks a continued chapter', /（续）/.test(plan.sessions[lastDone + 1].label))

section('Switching books')
const B = addSampleBook('B')
reading.startBook(B, 10)
check('starting B pauses A', lib.getBook(A).status === 'paused' && lib.getCurrentBookId() === B)
setDay('2026-11-30')
reading.startBook(A, 10)
plan = plans.loadPlan(A)
check('resuming A reschedules unread from today (no backlog)', plans.overdueIndexes(plan, '2026-11-30').length === 0 && plan.sessions[plan.sessions.findIndex((s) => !s.done)].date === '2026-11-30')

section('Finishing a book')
let r
for (let i = 0; i < plan.sessions.length; i++) if (!plans.loadPlan(A).sessions[i].done) r = reading.finishSession(A, i, 60)
check('the last session finishes the book', r.bookFinished && lib.getBook(A).status === 'finished' && lib.getCurrentBookId() === '')

section('Reading far ahead, then resetting')
setDay('2026-12-01')
const C = addSampleBook('C')
reading.startBook(C, 5)
for (let i = 0; i < 9; i++) reading.finishSession(C, i, 60) // today + 8 days ahead
plan = plans.loadPlan(C)
check('8 days ahead -> reschedule offered', reading.rescheduleReason(plan, '2026-12-01') === 'ahead')
reading.rescheduleBook(C)
plan = plans.loadPlan(C)
check('read sessions move back to the day they were read', plan.sessions.slice(0, 9).every((s) => s.date === '2026-12-01'))
check('next unread session is tomorrow', plan.sessions[9].date === '2026-12-02')
check('moved sessions stay on time', plans.sessionState(plan.sessions[5], '2026-12-01') === 'onTime')

section('Reading a finished book again')
reading.restartBook(A, 10)
plan = plans.loadPlan(A)
check('fresh plan from today; A is current and C is paused', plan.sessions.every((s) => !s.done) && plan.sessions[0].date === '2026-12-01' && lib.getCurrentBookId() === A && lib.getBook(C).status === 'paused')
