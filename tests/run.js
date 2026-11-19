// Runs every tests/*.test.js in its own Node process (fresh storage and clock).
// Usage: node tests/run.js [name ...]   e.g. node tests/run.js backup
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const only = process.argv.slice(2)
const files = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js'))
  .filter((f) => !only.length || only.some((o) => f.startsWith(o)))
let failedFiles = 0
for (const f of files) {
  console.log('\n' + f)
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' })
  if (r.status !== 0) failedFiles++
}
console.log('\n' + (failedFiles ? failedFiles + ' file(s) failed' : 'All ' + files.length + ' files passed'))
process.exitCode = failedFiles ? 1 : 0
