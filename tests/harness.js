// Shared test setup: a mocked `wx`, a controllable clock, and a tiny check() helper.
// Each test file gets a fresh copy because run.js starts one Node process per file.
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.join(__dirname, '..')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'readaily-test-'))

// Clock: new Date() and Date.now() return the simulated day at 09:00.
const RealDate = Date
let NOW = new RealDate(2026, 10, 1, 9).getTime()
global.Date = class extends RealDate {
  constructor(...a) { a.length ? super(...a) : super(NOW) }
  static now() { return NOW }
}
function setDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  NOW = new RealDate(y, m - 1, d, 9).getTime()
}

// Storage is JSON-serialized like the real one. The file system behaves like
// WeChat's: mkdirSync throws if the directory already exists.
const store = {}
global.wx = {
  env: { USER_DATA_PATH: TMP },
  getStorageSync: (k) => (store[k] === undefined ? '' : JSON.parse(store[k])),
  setStorageSync: (k, v) => { store[k] = JSON.stringify(v) },
  removeStorageSync: (k) => { delete store[k] },
  getStorageInfoSync: () => ({ keys: Object.keys(store) }),
  getFileSystemManager: () => ({
    mkdirSync: (p, r) => {
      if (fs.existsSync(p)) throw new Error('mkdirSync:fail file already exists')
      fs.mkdirSync(p, { recursive: r })
    },
    writeFileSync: (p, d, e) => fs.writeFileSync(p, typeof d === 'string' ? d : Buffer.from(d), e),
    readFileSync: (p, e) => fs.readFileSync(p, e),
    rmdirSync: (p, r) => fs.rmSync(p, { recursive: r }),
    readdirSync: (p) => fs.readdirSync(p),
    statSync: (p) => fs.statSync(p),
    accessSync: (p) => fs.accessSync(p),
    renameSync: (a, b) => fs.renameSync(a, b)
  })
}

const load = (name) => require(path.join(ROOT, 'miniprogram/utils', name))

// Synthetic book: 20 chapters of about 6000 CJK characters (about 290 minutes).
const SENTENCES = ['海风吹过小镇的屋顶。', '灯塔的光扫过黑色的海面。', '远处的渔船慢慢靠岸。', '她在笔记本上写下今天的天气。']
function sampleText() {
  let text = ''
  for (let ch = 1; ch <= 20; ch++) {
    text += '第' + ch + '章\n'
    for (let para = 0; para < 55; para++) {
      let line = ''
      for (let k = 0; k < 10; k++) line += SENTENCES[(ch + para + k) % SENTENCES.length]
      text += line + '\n'
    }
  }
  return text
}

const TEXT = sampleText()

/** Import the sample book under a title. Returns its id. */
function addSampleBook(title, extra) {
  const { parseTxt } = load('txt-parser')
  const parsed = parseTxt(TEXT, title + '.txt')
  return load('library').addBook(Object.assign({ text: TEXT, parsed, title, author: '', format: 'txt' }, extra)).id
}

/** Session state of book `id`, session `i`, on the simulated today. */
function stateOf(id, i) {
  const plans = load('plan')
  return plans.sessionState(plans.loadPlan(id).sessions[i], load('dates').todayKey())
}

let passed = 0
let failed = 0
function section(name) {
  console.log('\n  ' + name)
}
function check(name, cond) {
  cond ? passed++ : failed++
  console.log((cond ? '    ✓ ' : '    ✗ FAIL ') + name)
}
process.on('exit', () => {
  fs.rmSync(TMP, { recursive: true, force: true })
  console.log('  ' + passed + ' passed' + (failed ? ', ' + failed + ' FAILED' : ''))
  if (failed) process.exitCode = 1
})

module.exports = { TMP, RealDate, store, setDay, load, TEXT, addSampleBook, stateOf, section, check }
