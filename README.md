# Readaily

Readaily (published as 日积月读, "read a little every day") is a WeChat mini program that splits a book into daily ~10-minute reading sessions and tracks daily check-ins. Everything runs locally on the device: no backend, no cloud storage.

- Import `.txt` / `.epub` files from WeChat chat
- Date-based reading schedule with catch-up and read-ahead
- Check-in calendar, streaks, and "Time Bookmark" reward cards

See [docs/requirements.md](docs/requirements.md) for the full v1 requirements and [docs/release.md](docs/release.md) for releasing a new version.

## Development

1. Install [WeChat DevTools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).
2. Import this folder as a mini program project and set your own AppID (or a test AppID).

### Tests

The scheduling, check-in, and reward logic runs in Node with a mocked `wx` and clock:

```sh
node tests/sim.js
```

It simulates several weeks of use (missed days, catch-up, reading ahead, rescheduling, switching books, Time Bookmarks) and prints one line per check.

## License

MIT
