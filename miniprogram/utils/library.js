// Local book library. See requirements 1.4 and 1.5.
//
// Storage layout:
//   storage "books"        -> BookMeta[] (light, used by the bookshelf)
//   storage "book:<id>"    -> { chapters } (per book, can be large)
//   file    books/<id>/text.txt -> full decoded text (UTF-8)
//   file    books/<id>/cover.<ext> -> cover image (EPUB only, optional)

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

/** A book with the same title and the same size is treated as a duplicate. */
function findDuplicate(title, stats) {
  return listBooks().find(
    (b) => b.title === title && b.stats.cjk === stats.cjk && b.stats.words === stats.words
  )
}

/**
 * Save a parsed book. Throws on failure (e.g. storage full) after cleaning up.
 * @returns {object} the new BookMeta
 */
function addBook({ text, parsed, title, author, format, cover }) {
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
    wx.setStorageSync(detailKey(id), { chapters: parsed.chapters })
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

/** Remove a book's text, chapters, and progress. Check-in history is kept elsewhere. */
function deleteBook(id) {
  removeBookFiles(id)
  saveBookList(listBooks().filter((b) => b.id !== id))
}

function readBookText(id) {
  return wx.getFileSystemManager().readFileSync(textPath(id), 'utf8')
}

function getBookDetail(id) {
  return wx.getStorageSync(detailKey(id)) || null
}

module.exports = {
  listBooks,
  findDuplicate,
  addBook,
  deleteBook,
  readBookText,
  getBookDetail
}
