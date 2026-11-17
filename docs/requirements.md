# Readaily Requirements

Readaily is a WeChat mini program that splits a book into daily ~10-minute reading sessions and tracks daily check-ins. Everything runs locally on the device: no backend, no cloud storage.

Status: draft. Sections are added as each area is discussed.

---

## 1. Import

### 1.1 Why import goes through WeChat chat

Mini programs cannot access the phone's file system (neither iOS nor Android). The only general-purpose way to get a document into a mini program is `wx.chooseMessageFile`, which picks a file from WeChat chat history. Users therefore send the book to any chat first (the "File Transfer" chat is the most convenient) and then pick it inside the app.

### 1.2 Flow

1. User sends a `.txt` or `.epub` file to a WeChat chat (e.g. File Transfer).
2. In the app, user taps **Import book**, which opens `wx.chooseMessageFile` filtered to `txt` / `epub`. One file per import.
3. The app parses the file locally: detects encoding, splits chapters, extracts title and author.
4. A confirmation page shows: title, author, total characters, chapter count, estimated number of days, and a preview of the first few lines (so the user can spot garbled text).
5. On confirm, the book is saved locally and the user moves on to setting up the reading plan (see Splitting, TBD).

### 1.3 Onboarding guide

When the bookshelf is empty, show a short illustrated guide explaining how to get a book into the app (e.g. Files app → Share → WeChat → File Transfer → back to Readaily → Import).

### 1.4 Rules

| # | Topic | Decision |
|---|-------|----------|
| 1 | Multiple books | The bookshelf can hold multiple books, but only **one book is "currently reading"** at a time. Daily check-ins count against that book only. |
| 2 | TXT encoding | Auto-detect UTF-8 vs GBK/GB18030. Decode GBK with a bundled decoding table (~100–200 KB). The preview on the confirmation page lets the user catch garbled text. |
| 3 | TXT chapters | Detect chapter headings with regex (e.g. `第X章` / `第X回` / `第X卷`, `Chapter N`). If none are found, treat the book as having no chapters and split by paragraphs. No manual chapter editing in v1. |
| 4 | EPUB scope | Text and paragraphs only, chaptered by the book's own table of contents. Images, styles, and footnote links are dropped in v1. DRM-protected files are rejected with a "protected books are not supported" message. |
| 5 | Size limit | Only the parsed plain text is stored; the original file is discarded. Reject files larger than **50 MB**. |
| 6 | Duplicates | If a book with the same title and character count already exists, ask the user to overwrite or keep both. |
| 7 | Deleting a book | Removes the text and reading progress. **Check-in history is kept**, so streaks are not affected. |
| 8 | Batch import | Not supported in v1: one file per import. |

### 1.5 Storage

- Parsed book text: local file system under `wx.env.USER_DATA_PATH` (~200 MB total).
- Book metadata, progress, check-ins: `wx.setStorage` (10 MB limit).

### 1.6 Out of scope for v1 (possible later)

- **Open from chat**: register `supportedMaterials` in `app.json` so users can open a txt/epub directly from a chat via "Open with mini program".
- **Paste text**: import text from the clipboard (for articles or short pieces).
- PDF and other formats.
- Manual chapter editing.

---

## 2. Splitting

TBD.

## 3. Daily reading page

TBD.

## 4. Check-in calendar

TBD.
