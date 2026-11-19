// Backup to a zip and restore from it.
const fs = require('fs')
const { TMP, setDay, store, load, addSampleBook, section, check } = require('./harness')
const lib = load('library'), reading = load('reading'), backup = load('backup')

setDay('2026-11-01')
const A = addSampleBook('A')
addSampleBook('B')
reading.startBook(A, 10)
reading.finishSession(A, 0, 300)
fs.writeFileSync(TMP + '/books/' + A + '/cover.jpg', Buffer.from([0xff, 0xd8, 1, 2, 3]))
lib.updateBook(A, { coverPath: TMP + '/books/' + A + '/cover.jpg' })
store['debug:unlocked'] = JSON.stringify(1)

const userData = () => JSON.stringify(Object.keys(store).filter((k) => !k.startsWith('debug:')).sort().map((k) => [k, store[k]]))
const snapshot = userData()
const textBefore = lib.readBookText(A)

section('Creating a backup')
const { data: zip, bookCount } = backup.createBackup()
check('counts the books', bookCount === 2)
check('opens again as a valid backup', backup.readBackup(zip.buffer).bookCount === 2)

section('Restoring')
lib.deleteBook(A); delete store.checkins; store.junk = '1'
backup.restoreBackup(backup.readBackup(zip.buffer))
check('storage comes back exactly (extra keys removed)', userData() === snapshot)
check('book text and cover come back', lib.readBookText(A) === textBefore && fs.readFileSync(lib.getBook(A).coverPath).length === 5)
check('dev-tool keys are left alone', store['debug:unlocked'] === '1')
check('no temp folders left behind', !fs.existsSync(TMP + '/restore-tmp') && !fs.existsSync(TMP + '/books-old'))

section('Failures')
const realSet = global.wx.setStorageSync
let thrown = false
global.wx.setStorageSync = (k, v) => { if (k === 'checkins' && !thrown) { thrown = true; throw new Error('full') } realSet(k, v) }
let failed = false
try { backup.restoreBackup(backup.readBackup(zip.buffer)) } catch (e) { failed = true }
global.wx.setStorageSync = realSet
check('a failed restore puts the old data back', failed && userData() === snapshot && lib.readBookText(A) === textBefore)
let message = ''
try { backup.readBackup(new Uint8Array([1, 2, 3]).buffer) } catch (e) { message = e.message }
check('a random file is rejected with a clear message', message === '这不是日积月读的备份文件')
