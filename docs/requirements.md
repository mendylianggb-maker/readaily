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

## 2. Splitting and schedule

### 2.1 Daily amount

- User picks a daily reading time: **5 / 10 (default) / 15 / 20 minutes**.
- Language is detected per book at import (CJK characters majority → Chinese, otherwise English).
- Default reading speeds (configurable constants, to be tuned later):

| Language | Unit | Speed | 10 minutes ≈ |
|----------|------|-------|--------------|
| Chinese | characters | 400 / min | 4,000 characters |
| English | words | 150 / min | 1,500 words |

- Mixed-language text: CJK characters and English words are counted together.
- The import confirmation page shows the estimated number of days.
- Later: auto-calibrate speed from the user's actual reading time.

### 2.2 Where to cut

Principle: prefer chapter ends, otherwise paragraph boundaries, never mid-sentence. Let `T` be the daily target.

| Case | Rule |
|------|------|
| A chapter ends while the session is within 70%–130% of `T` | Cut at the chapter end |
| Chapter is short (session < 70% of `T` at its end) | Continue into the next chapter; several chapters can share one day |
| Chapter is long | Cut at the paragraph boundary closest to `T`; the chapter spans several days |
| Remainder of a chapter < 30% of `T` | Merge it into the previous day |
| A single paragraph > 2 × `T` | Cut at the sentence end (`。！？.!?`) closest to `T` |
| Book has no chapters | Cut by paragraphs only |

Each session shows its chapter range at the top, e.g. "Chapter 3 (2/3)" or "Chapters 5–6".

Implementation note: a plan is just a list of `(startOffset, endOffset, date)` entries; re-splitting only recomputes this list and never touches the stored text.

### 2.3 Date-based schedule

Every session is assigned a calendar date: session 1 on the start date, session 2 the next day, and so on.

Session states:

| State | Meaning | Calendar color |
|-------|---------|----------------|
| `upcoming` | Date not reached, not read | — |
| `overdue` | Date passed, not read | gray / empty |
| `onTime` | Read on its date, or read early | green |
| `late` | Read after its date (catch-up) | yellow |

- **Reading today**: the home page shows today's session and the number of overdue sessions, e.g. "Today 11/17 · Day 23 [Start]" and "1 day to catch up (11/16) [Catch up]".
- **Skipping**: no explicit skip action. The user simply reads today's session; earlier unread sessions stay `overdue` and can be opened from the calendar any time.
- **Reading ahead**: allowed. The user can keep reading future sessions in order (e.g. before a holiday or trip). A session read early counts as `onTime` and is green.
- **Rescheduling**: when overdue sessions reach **7 or more**, offer a **Reschedule** button that moves all unread sessions to start from today (clears the backlog, pushes the end date out). Optional; the user can keep catching up instead.
- **Changing daily time**: re-split the unread part and reschedule it starting today. Finished sessions and check-ins are unchanged.

### 2.4 Switching books

- **Start a new book**: its session 1 is scheduled for today.
- **The previous book is paused**: its finished records are kept.
- **Resume a paused book**: continue from the first unread session; all unread sessions are rescheduled from today (equivalent to an automatic Reschedule), so the pause does not create a backlog.

### 2.5 Streaks and rewards

- **Streak (lenient)**: a calendar day counts if the user finished at least one session that day (on time, catch-up, or reading ahead). A day whose session was already read early also counts when that date arrives, so reading ahead before a trip keeps the streak alive.
- **Reward card — "Time Bookmark"** (UI name: 时光书签): every **14 consecutive streak days** earns one card. A card turns one `late` (yellow) session into `onTime` (green). It cannot be used on `overdue` (unread) sessions.
  - Cards can be saved, up to **3**. While holding 3, completing another 14-day run earns nothing.
  - No anti-cheating: reading many days ahead and letting the streak grow is acceptable. This is a self-motivation tool.

## 3. Daily reading page

TBD.

## 4. Check-in calendar

TBD.
