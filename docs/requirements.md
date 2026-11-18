# Readaily Requirements

Readaily is a WeChat mini program that splits a book into daily ~10-minute reading sessions and tracks daily check-ins. Everything runs locally on the device: no backend, no cloud storage.

Status: v1 draft. All four areas discussed; details may still change.

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
| 4 | EPUB scope | Text and paragraphs only, chaptered by the book's own table of contents. Images, styles, and footnote links are dropped in v1. DRM-protected files are rejected with a "protected books are not supported" message. Front/back matter (cover page, contents, copyright, acknowledgments, index, ...) is excluded from the schedule by default; the import page has an "Adjust content" toggle list. Excluded items are still saved and can be viewed from the bookshelf ("Extra content"), without check-ins. |
| 5 | Size limit | Only the parsed plain text is stored; the original file is discarded. Reject files larger than **50 MB**. |
| 6 | Duplicates | If a book with the same title and character count already exists, ask the user to overwrite or keep both. |
| 7 | Deleting a book | Removes the text and reading progress. **Check-in history is kept**, so streaks are not affected. |
| 8 | Batch import | Not supported in v1: one file per import. |
| 9 | Cover image | EPUB: keep the cover image as the bookshelf thumbnail (other images are still dropped). Find it via the manifest item with `properties="cover-image"` (EPUB 3), then `<meta name="cover">` (EPUB 2), then the first image in the cover page. Save it under `wx.env.USER_DATA_PATH`, compressed if large. TXT books, and EPUBs without a cover, get a generated placeholder cover (title on a colored background; exact style decided in the design pass). |

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
- **Reading ahead**: allowed, in **any order** (any future session can be opened from the calendar and finished). A session read early counts as `onTime` and is green.
  - The home page suggests the first unread future session once today's session (if any) is read. Overdue sessions do not block reading ahead.
- **Rescheduling**: offered when overdue sessions reach **7 or more**, or when the user has read **7 or more** sessions ahead. Optional. One Reschedule action handles both:
  - sessions read ahead move back to the date they were actually read (still `onTime`), and their pre-credited future check-ins are removed;
  - all unread sessions move to consecutive dates starting today (or tomorrow if today is already taken). Behind: the backlog clears and the end date moves out. Ahead: the end date moves in.
- **Changing daily time**: re-split the unread part and reschedule it starting today. Finished sessions and check-ins are unchanged.
  - Precisely: everything up to the last read session is kept; the text after it is re-split. If that starts mid-chapter, the label shows "（续）". The setting lives on the Settings page under the current book's plan.

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

### 3.1 Entry points

- Home page **Start** → today's session.
- Home page **Catch up**, or tapping a date on the calendar → that date's session.

### 3.2 Layout

- **Header**: date, day number, estimated time (e.g. "11/17 · Day 23 · ~10 min"), chapter range of this session, whole-book progress bar.
- **Body**: plain text with paragraphs. When a new chapter starts inside a session, its title is shown inline.
- **End of session**: a **Finish** button appears only after scrolling to the end.

### 3.3 Behavior

| # | Topic | Decision |
|---|-------|----------|
| 1 | Paging | Vertical scrolling. Horizontal page turning is out of scope for v1. |
| 2 | Completion | The session counts as read only when the user taps **Finish** at the end (no auto check-in). No minimum reading time. |
| 3 | After finishing | Show a check-in animation and the current streak; show an extra notice when a Time Bookmark card is earned. Then offer **Read next day** (read ahead) and **Catch up** (only if there are overdue sessions). |
| 4 | Leaving mid-session | Remember the scroll position within the session and restore it next time. |
| 5 | Keep screen on | `wx.setKeepScreenOn` while reading. |
| 6 | Reading time | Record actual time spent per session silently (not shown); used later to calibrate reading speed. |

### 3.4 Reading settings

Global (same for all books), saved locally. Adjusted from the **Aa** panel on the reading page and applied live. The Settings page only holds the current book's daily minutes.

| Setting | Options |
|---------|---------|
| Font size | 4 levels |
| Line height | 3 levels |
| Font | Sans-serif (default) / Serif, system fonts only. Mainly useful for English books: Latin serif fonts exist on both iOS (e.g. Georgia) and Android (Noto Serif), so the difference is always visible. For Chinese, some Android devices have no CJK serif font and fall back to sans-serif. |
| Background | White / Sepia / Dark |
| Dark mode | Follows the system dark mode automatically; the user can still pick manually. |

Custom fonts are out of scope for v1. A full CJK font is several MB, too large for the 2 MB main package. A Latin-only font (e.g. a book serif, ~100–300 KB) could be bundled later.

### 3.5 Out of scope for v1

Highlights, notes, bookmarks, text-to-speech, full-text search, horizontal paging, custom fonts.

## 4. Check-in calendar

### 4.1 Scope

- The calendar shows the **currently reading book's** schedule only.
- Streak and total reading days are **global** (across all books). Past books' history is viewed from the bookshelf.

### 4.2 Layout

- **Stats header**: streak, total reading days, Time Bookmark count (x/3), current book progress, estimated finish date.
- **Month view** (swipe between months):

| Mark | Meaning |
|------|---------|
| Green | `onTime` (including read ahead) |
| Yellow | `late` (caught up) |
| Gray | `overdue` |
| Outline | `upcoming` |
| Blank | No session scheduled |
| Circled | Today |

### 4.3 Tapping a date

Tapping a date opens that date's reading page **directly** (no intermediate popup).

| State | Tap result |
|-------|-----------|
| `overdue` | Reading page (catch-up) |
| `onTime` / `late` | Reading page for re-reading; status does not change, Finish button is replaced by "Done" |
| `upcoming` | Reading page (read ahead, any order) |
| Blank | Nothing |

### 4.4 Where other actions live

- **Reschedule**: when overdue sessions ≥ 7, a banner appears at the top of the calendar (and on the home page): "9 days behind · [Reschedule]".
- **Use a Time Bookmark**: tap the bookmark counter in the stats header to enter selection mode. Yellow dates are highlighted; tapping one converts it to green and uses a card. Tap again or Cancel to exit.
- **Explaining the Time Bookmark**: users must understand what the card does.
  - When the first card is earned, show a short explainer: what it is, how it was earned (14-day streak), what it does (turns one yellow catch-up day green), and how to use it.
  - A "?" icon next to the counter in the stats header reopens the explainer.
  - Selection mode shows a hint bar: "Pick a yellow day to mark it as on time".
  - With 0 cards, tapping the counter shows the explainer plus progress toward the next card (e.g. "9 / 14 days").

### 4.5 Home page week strip

The home page shows a Mon–Sun row with this week's marks, so the user sees progress without opening the calendar.

### 4.6 Finishing a book

- A celebration screen with a short animation (e.g. confetti).
- Summary: total days, on-time rate, total characters/words read.
- An encouraging message that suggests rewarding yourself, picked at random from a small set, e.g.:
  - 读完一整本书了！今天奖励一下自己吧，去喝杯喜欢的饮料。
  - 坚持了 N 天，这本书是你的了。给自己放个不看手机的下午吧。
  - 又读完一本。挑个小礼物送给认真读书的自己。
- The book moves to "Finished" on the bookshelf. A finished book can be **read again**: a fresh plan from day 1 (check-in history is kept). Low priority.
- Prompt to import or pick the next book (optional, not forced).
