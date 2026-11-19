# Tests

Plain Node scripts, no dependencies. `harness.js` mocks `wx` (storage, file system), the clock, and imports a synthetic 20-chapter book.

```sh
node tests/run.js          # all files, each in a fresh process
node tests/run.js streaks  # files whose name starts with "streaks"
```

| File | Covers |
|---|---|
| `schedule.test.js` | Plans: daily states, catching up, rescheduling (behind and ahead), changing daily minutes, switching, finishing, reading again |
| `streaks.test.js` | Check-ins, streaks, pre-credits for reading ahead, Time Bookmark cards and their limit |
| `library.test.js` | Bookshelf info line, duplicate detection, EPUB extras |
| `devtools.test.js` | Simulated date in develop, trial (7-tap unlock) and release builds |

To add a test, create `<topic>.test.js`, require `./harness`, and group checks with `section()` and `check()`.

The mocked file system behaves like WeChat's where it matters (e.g. `mkdirSync` fails on an existing folder). UI is not covered here; check pages in WeChat DevTools.
