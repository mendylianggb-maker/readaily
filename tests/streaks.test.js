// Check-ins, streaks and Time Bookmark cards.
const { setDay, store, RealDate, load, addSampleBook, stateOf: st, section, check } = require('./harness')
const lib = load('library'), reading = load('reading'), plans = load('plan'), ck = load('checkins')

setDay('2026-11-01')
const A = addSampleBook('A')
reading.startBook(A, 5)

section('Streak counting')
reading.finishSession(A, 0, 300)
check('first day read -> streak 1', ck.streakInfo('2026-11-01').length === 1)
setDay('2026-11-03') // 11/02 skipped
check('a missed day breaks the streak', ck.streakInfo('2026-11-03').length === 0)
reading.finishSession(A, 1, 300)
check('catching up counts only today: streak 1, total 2', ck.streakInfo('2026-11-03').length === 1 && ck.totalDays('2026-11-03') === 2)
reading.finishSession(A, 2, 300)
check('reading today as well does not count twice', ck.streakInfo('2026-11-03').length === 1 && ck.totalDays('2026-11-03') === 2)
reading.finishSession(A, 3, 300) // 11/04 read ahead
check('reading ahead pre-credits that date', ck.loadCheckins()['2026-11-04'] === 1)
setDay('2026-11-04')
check('pre-credited day keeps the streak going', ck.streakInfo('2026-11-04').length === 2)

section('Time Bookmark cards')
for (let d = 5; d <= 16; d++) {
  const key = '2026-11-' + String(d).padStart(2, '0'); setDay(key)
  reading.finishSession(A, plans.todayIndex(plans.loadPlan(A), key), 300)
}
check('14-day streak', ck.streakInfo('2026-11-16').length === 14)
check('one card per ' + ck.STREAK_FOR_CARD + ' streak days', ck.loadRewards().cards === 2)
check('a card turns a late day into on time', reading.bookmarkSession(A, 1) && st(A, 1) === 'onTime' && ck.loadRewards().cards === 1)
check('a card only works on late days', reading.bookmarkSession(A, 1) === false && ck.loadRewards().cards === 1)
setDay('2026-11-25')
check('being away breaks the streak', reading.homeView().streak === 0)

section('Resetting a schedule removes future pre-credits')
setDay('2026-12-01')
const C = addSampleBook('C')
reading.startBook(C, 5)
for (let i = 0; i < 9; i++) reading.finishSession(C, i, 60)
check('pre-credits exist for future dates', ck.loadCheckins()['2026-12-05'] === 1)
reading.rescheduleBook(C)
check('future pre-credits removed, today kept', !ck.loadCheckins()['2026-12-05'] && ck.loadCheckins()['2026-12-01'] === 1)

section('Card limit and book deletion')
store.rewards = JSON.stringify({ cards: ck.MAX_CARDS, runStart: '', runAwarded: 0 })
const c = {}
for (let i = 0; i < 14; i++) {
  const d = new RealDate(2026, 11, 1 + i)
  c[d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')] = 1
}
store.checkins = JSON.stringify(c)
check('no new card while holding ' + ck.MAX_CARDS, ck.updateRewards('2026-12-14') === 0 && ck.loadRewards().cards === ck.MAX_CARDS)
lib.deleteBook(C)
check('deleting a book keeps check-ins', Object.keys(ck.loadCheckins()).length === 14 && !store['plan:' + C])
