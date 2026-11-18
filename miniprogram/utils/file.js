// Thin promise wrappers around WeChat file APIs.

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB, see requirements 1.4

function chooseBookFile() {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['txt', 'epub'],
      success: (res) => resolve(res.tempFiles[0]),
      fail: reject
    })
  })
}

function readFileAsArrayBuffer(filePath) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath,
      success: (res) => resolve(res.data),
      fail: reject
    })
  })
}

function getExtension(fileName) {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase()
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

module.exports = {
  MAX_FILE_SIZE,
  chooseBookFile,
  readFileAsArrayBuffer,
  getExtension,
  formatSize
}
