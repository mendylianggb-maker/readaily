// The bookshelf: info lines, duplicate detection, and EPUB extras.
const { setDay, load, TEXT, addSampleBook, section, check } = require('./harness')
const lib = load('library'), reading = load('reading'), { parseTxt } = load('txt-parser')

setDay('2026-11-01')

section('Bookshelf info line')
const N = addSampleBook('N')
check('a new book shows its reading time', /^约 \d+ (小时|分钟)$/.test(reading.shelfInfo(lib.getBook(N)).info))
reading.startBook(N, 10)
check('the current book shows progress', reading.shelfInfo(lib.getBook(N)).info === '0%')

section('Duplicates')
const p = parseTxt(TEXT, 'a.txt')
check('WeChat\'s "(1)" suffix is dropped from the title', parseTxt(TEXT, 'Book(1).txt').title === 'Book' && parseTxt(TEXT, '书名（2）.txt').title === '书名')
check('same content is a duplicate even with another title', lib.findDuplicate(p.stats, p.chapters.length) !== undefined)
check('different content is not a duplicate', lib.findDuplicate({ cjk: 1, words: 0 }, 0) === undefined)

section('EPUB extras')
const E = lib.addBook({ text: TEXT, parsed: p, title: 'E', author: '', format: 'epub', extras: [{ title: 'Copyright', text: 'All rights reserved.\n' }, { title: 'Index', text: 'A, B, C\n' }] })
const ex = lib.getBookDetail(E.id).extras
check('extras are stored and readable by offset', E.extraCount === 2 && lib.readExtrasText(E.id).slice(ex[1].start, ex[1].end) === 'A, B, C\n')
