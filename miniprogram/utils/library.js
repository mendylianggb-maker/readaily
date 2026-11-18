// Local book library. See requirements 1.4 and 1.5.
//
// Storage layout:
//   storage "books"        -> BookMeta[] (light, used by the bookshelf)
//   storage "book:<id>"    -> { chapters } (per book, can be large)
//   file    books/<id>/text.txt -> full decoded text (UTF-8)
//   file    books/<id>/cover.<ext> -> cover image (EPUB only, optional)
//   file    books/<id>/extras.txt -> skipped EPUB items (cover page, index, ...), viewable, not scheduled

const BOOKS_KEY = 'books'
const detailKey = (id) => 'book:' + id

function rootDir() {
  return wx.env.USER_DATA_PATH + '/books'
}

function bookDir(id) {
  return rootDir() + '/' + id
}

function textPath(id) {
  return bookDir(id) + '/text.txt'
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function listBooks() {
  try {
    return wx.getStorageSync(BOOKS_KEY) || []
  } catch (err) {
    console.error(err)
    return []
  }
}

function saveBookList(books) {
  wx.setStorageSync(BOOKS_KEY, books)
}

/**
 * A book with the same content size and chapter count is treated as a
 * duplicate. The title is not compared: a re-sent file may be renamed
 * (e.g. "book(1).txt"), and the user may have edited the title.
 */
function findDuplicate(stats, chapterCount) {
  return listBooks().find(
    (b) => b.stats && b.stats.cjk === stats.cjk && b.stats.words === stats.words && (b.chapterCount || 0) === chapterCount
  )
}

/**
 * Save a parsed book. Throws on failure (e.g. storage full) after cleaning up.
 * @returns {object} the new BookMeta
 */
function addBook({ text, parsed, title, author, format, cover, extras }) {
  const fs = wx.getFileSystemManager()
  const id = newId()
  const meta = {
    id,
    title,
    author,
    format,
    language: parsed.language,
    stats: parsed.stats,
    chapterCount: parsed.hasChapters ? parsed.chapters.length : 0,
    coverPath: '',
    extraCount: extras ? extras.length : 0,
    status: 'new', // new | reading | paused | finished
    importedAt: Date.now()
  }

  try {
    fs.mkdirSync(bookDir(id), true)
    fs.writeFileSync(textPath(id), text, 'utf8')
    if (cover) {
      // Copy into a standalone ArrayBuffer: the Uint8Array may be a view into a larger buffer.
      const data = cover.data.buffer.slice(cover.data.byteOffset, cover.data.byteOffset + cover.data.byteLength)
      meta.coverPath = bookDir(id) + '/cover.' + cover.ext
      fs.writeFileSync(meta.coverPath, data)
    }
    const detail = { chapters: parsed.chapters, extras: [] }
    if (extras && extras.length) {
      let all = ''
      extras.forEach((x) => {
        detail.extras.push({ title: x.title, start: all.length, end: all.length + x.text.length })
        all += x.text
      })
      fs.writeFileSync(bookDir(id) + '/extras.txt', all, 'utf8')
    }
    wx.setStorageSync(detailKey(id), detail)
    saveBookList(listBooks().concat(meta))
  } catch (err) {
    removeBookFiles(id)
    throw err
  }
  return meta
}

function removeBookFiles(id) {
  const fs = wx.getFileSystemManager()
  try {
    fs.rmdirSync(bookDir(id), true)
  } catch (err) {
    // Directory may not exist.
  }
  try {
    wx.removeStorageSync(detailKey(id))
  } catch (err) {
    console.error(err)
  }
}

/** Remove a book's text, chapters, plan, and progress. Check-in history is kept elsewhere. */
function deleteBook(id) {
  removeBookFiles(id)
  try {
    wx.removeStorageSync('plan:' + id)
    wx.removeStorageSync('progress:' + id)
  } catch (err) {
    console.error(err)
  }
  if (getCurrentBookId() === id) setCurrentBookId('')
  saveBookList(listBooks().filter((b) => b.id !== id))
}

function getBook(id) {
  return listBooks().find((b) => b.id === id) || null
}

function updateBook(id, patch) {
  saveBookList(listBooks().map((b) => (b.id === id ? Object.assign({}, b, patch) : b)))
}

function getCurrentBookId() {
  return wx.getStorageSync('currentBookId') || ''
}

function setCurrentBookId(id) {
  wx.setStorageSync('currentBookId', id)
}

function readBookText(id) {
  return wx.getFileSystemManager().readFileSync(textPath(id), 'utf8')
}

function readExtrasText(id) {
  return wx.getFileSystemManager().readFileSync(bookDir(id) + '/extras.txt', 'utf8')
}

function getBookDetail(id) {
  return wx.getStorageSync(detailKey(id)) || null
}

module.exports = {
  listBooks,
  getBook,
  updateBook,
  getCurrentBookId,
  setCurrentBookId,
  findDuplicate,
  addBook,
  deleteBook,
  readBookText,
  readExtrasText,
  getBookDetail
}
