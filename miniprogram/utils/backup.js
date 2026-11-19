// Backup and restore. See requirements 5.
//
// A backup is one zip file the user sends to a WeChat chat (e.g. File Transfer):
//   readaily.json        -> { format, version, createdAt, userDataPath, storage: { key: value } }
//   books/<id>/...       -> book files (text, cover, extras), copied as-is
// Restoring replaces everything on this phone with the backup's content.
// Dev-tool keys ("debug:*") are neither saved nor overwritten.

const fflate = require('../vendor/fflate')

const FORMAT = 'readaily-backup'
const VERSION = 1
const MANIFEST = 'readaily.json'
const LAST_BACKUP_KEY = 'backup:last'
const SKIP_KEY = /^(debug|backup):/
const STORED = /\.(jpe?g|png|gif|webp)$/i // already compressed

function booksRoot() {
  return wx.env.USER_DATA_PATH + '/books'
}

function fsm() {
  return wx.getFileSystemManager()
}

/** All files under dir, as paths relative to dir. */
function listFiles(dir) {
  const fs = fsm()
  let names
  try {
    names = fs.readdirSync(dir)
  } catch (err) {
    return [] // Nothing imported yet.
  }
  const out = []
  names.forEach((name) => {
    const full = dir + '/' + name
    if (fs.statSync(full).isDirectory()) listFiles(full).forEach((p) => out.push(name + '/' + p))
    else out.push(name)
  })
  return out
}

function backupKeys() {
  return wx.getStorageInfoSync().keys.filter((k) => !SKIP_KEY.test(k))
}

/** Build the backup zip. Returns { data: Uint8Array, bookCount }. */
function createBackup() {
  const storage = {}
  backupKeys().forEach((k) => { storage[k] = wx.getStorageSync(k) })
  const manifest = { format: FORMAT, version: VERSION, createdAt: Date.now(), userDataPath: wx.env.USER_DATA_PATH, storage }
  const entries = { [MANIFEST]: fflate.strToU8(JSON.stringify(manifest)) }
  listFiles(booksRoot()).forEach((p) => {
    const data = new Uint8Array(fsm().readFileSync(booksRoot() + '/' + p))
    entries['books/' + p] = [data, { level: STORED.test(p) ? 0 : 6 }]
  })
  return { data: fflate.zipSync(entries), bookCount: (storage.books || []).length }
}

/** Read and check a backup zip without changing anything. Throws a user-facing message. */
function readBackup(buffer) {
  let files
  try {
    files = fflate.unzipSync(new Uint8Array(buffer))
  } catch (err) {
    throw new Error('这不是日积月读的备份文件')
  }
  let manifest = null
  try {
    manifest = JSON.parse(fflate.strFromU8(files[MANIFEST]))
  } catch (err) {
    // Handled below.
  }
  if (!manifest || manifest.format !== FORMAT) throw new Error('这不是日积月读的备份文件')
  if (manifest.version > VERSION) throw new Error('这个备份来自更新的版本，请先更新小程序')
  const books = manifest.storage.books || []
  return { manifest, files, createdAt: manifest.createdAt, bookCount: books.length }
}

/** mkdir -p that tolerates existing directories (WeChat throws on them). */
function ensureDir(dir) {
  try {
    wx.getFileSystemManager().accessSync(dir)
  } catch (err) {
    wx.getFileSystemManager().mkdirSync(dir, true)
  }
}

function removeDir(dir) {
  try {
    fsm().rmdirSync(dir, true)
  } catch (err) {
    // Does not exist.
  }
}

function snapshotStorage() {
  const out = {}
  wx.getStorageInfoSync().keys.forEach((k) => { if (!/^debug:/.test(k)) out[k] = wx.getStorageSync(k) })
  return out
}

function replaceStorage(storage) {
  wx.getStorageInfoSync().keys.forEach((k) => { if (!/^debug:/.test(k)) wx.removeStorageSync(k) })
  Object.keys(storage).forEach((k) => wx.setStorageSync(k, storage[k]))
}

/**
 * Replace all local data with a backup from readBackup().
 * Book files are written to a staging folder first; if anything fails, the
 * old data is put back and the error is rethrown.
 */
function restoreBackup({ manifest, files }) {
  const fs = fsm()
  const root = wx.env.USER_DATA_PATH
  const staging = root + '/restore-tmp'
  const old = root + '/books-old'
  const storage = Object.assign({}, manifest.storage)
  // Cover paths are absolute; move them to this phone's data path.
  if (storage.books) {
    storage.books = storage.books.map((b) =>
      b.coverPath && b.coverPath.indexOf(manifest.userDataPath) === 0
        ? Object.assign({}, b, { coverPath: root + b.coverPath.slice(manifest.userDataPath.length) })
        : b
    )
  }

  removeDir(staging)
  removeDir(old)
  try {
    ensureDir(staging + '/books')
    Object.keys(files).forEach((name) => {
      if (name.indexOf('books/') !== 0 || name.endsWith('/')) return
      const full = staging + '/' + name
      ensureDir(full.slice(0, full.lastIndexOf('/')))
      const u8 = files[name]
      fs.writeFileSync(full, u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength))
    })
  } catch (err) {
    removeDir(staging)
    throw err
  }

  const before = snapshotStorage()
  let hadBooks = true
  try {
    fs.accessSync(root + '/books')
  } catch (err) {
    hadBooks = false
  }
  try {
    if (hadBooks) fs.renameSync(root + '/books', old)
    fs.renameSync(staging + '/books', root + '/books')
    replaceStorage(storage)
  } catch (err) {
    removeDir(root + '/books')
    if (hadBooks) fs.renameSync(old, root + '/books')
    replaceStorage(before)
    removeDir(staging)
    throw err
  }
  removeDir(old)
  removeDir(staging)
}

function lastBackupTime() {
  return Number(wx.getStorageSync(LAST_BACKUP_KEY)) || 0
}

function markBackedUp() {
  wx.setStorageSync(LAST_BACKUP_KEY, Date.now())
}

module.exports = { createBackup, readBackup, restoreBackup, lastBackupTime, markBackedUp }
