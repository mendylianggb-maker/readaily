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

The app logic runs in Node with a mocked `wx` and clock:

```sh
node tests/run.js          # all tests
node tests/run.js backup   # one file
```

See [tests/README.md](tests/README.md) for what each file covers.

## License

MIT

The offline dictionary (`miniprogram/dict1`-`dict3`) is generated from [ECDICT](https://github.com/skywind3000/ECDICT), MIT licensed; see [licenses/ECDICT-LICENSE](licenses/ECDICT-LICENSE). To rebuild it, download `ecdict.csv` from that repository and run `node scripts/build-dict.js path/to/ecdict.csv`.
