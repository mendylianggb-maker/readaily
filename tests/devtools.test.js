// Simulated date: always on in develop, unlockable in trial, never in release.
const { setDay, store, load, section, check } = require('./harness')
const dates = load('dates')

setDay('2026-12-01')
store['debug:dayOffset'] = JSON.stringify(3)
const env = (v) => { global.wx.getAccountInfoSync = () => ({ miniProgram: { envVersion: v } }) }

section('Release (and unknown) builds')
check('simulated date ignored without a dev build', dates.todayKey() === '2026-12-01')

section('Develop build')
env('develop')
check('simulated date honored', dates.todayKey() === '2026-12-04')

section('Trial build')
env('trial')
check('ignored until dev tools are unlocked', dates.todayKey() === '2026-12-01' && !dates.devToolsEnabled())
dates.setDevToolsUnlocked(true)
check('honored after unlocking', dates.todayKey() === '2026-12-04')
dates.setDevToolsUnlocked(false)
check('locking again resets the simulated date', dates.todayKey() === '2026-12-01' && !store['debug:dayOffset'])

section('Release build')
store['debug:dayOffset'] = JSON.stringify(3)
dates.setDevToolsUnlocked(true)
env('release')
check('ignored even if unlocked earlier', dates.todayKey() === '2026-12-01' && !dates.devToolsEnabled() && !dates.canUnlockDevTools())
