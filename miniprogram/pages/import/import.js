const {
  MAX_FILE_SIZE,
  chooseBookFile,
  readFileAsArrayBuffer,
  getExtension,
  formatSize
} = require('../../utils/file')
const { decodeText } = require('../../utils/encoding')

const PREVIEW_CHARS = 300

Page({
  data: {
    file: null, // { name, sizeText, ext }
    encoding: '',
    preview: '',
    error: '',
    loading: false
  },

  async onChooseFile() {
    this.setData({ error: '', file: null, encoding: '', preview: '' })

    let picked
    try {
      picked = await chooseBookFile()
    } catch (err) {
      // User cancelled the picker: not an error.
      if (err && /cancel/i.test(err.errMsg || '')) return
      this.setData({ error: '选择文件失败，请重试' })
      return
    }

    const ext = getExtension(picked.name)
    if (ext !== 'txt' && ext !== 'epub') {
      this.setData({ error: '只支持 txt 和 epub 格式' })
      return
    }
    if (picked.size > MAX_FILE_SIZE) {
      this.setData({ error: '文件太大了，最大支持 50MB' })
      return
    }

    this.setData({
      loading: true,
      file: { name: picked.name, sizeText: formatSize(picked.size), ext }
    })

    try {
      const buffer = await readFileAsArrayBuffer(picked.path)
      if (ext === 'epub') {
        this.setData({ preview: '（epub 解析稍后支持）' })
        return
      }
      const result = decodeText(buffer)
      if (result.error) {
        this.setData({ error: '无法识别这个文件的编码，请换成 UTF-8 或 GBK 编码的 txt' })
        return
      }
      this.setData({
        encoding: result.encoding,
        preview: result.text.trim().slice(0, PREVIEW_CHARS)
      })
    } catch (err) {
      this.setData({ error: '读取文件失败，请重试' })
    } finally {
      this.setData({ loading: false })
    }
  }
})

