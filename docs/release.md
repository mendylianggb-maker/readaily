# Releasing a new version

## Update the trial version

1. Test in WeChat DevTools, run `node tests/sim.js`.
2. DevTools → **Upload**. Version: bump it (`0.1.0` → `0.1.1`; new features → `0.2.0`). Note: one line on what changed.
3. mp.weixin.qq.com → **Management → Version Management** → the new development version → **Set as trial version**. Page path: leave `pages/home/home`.
4. Done. Trial users don't rescan; they get the new version on the next launch (fully close the mini program if it still shows the old one).

## Notes

- The "contact administrators to set this upload to the trial version" message after uploading is a reminder, not an error.
- Trial members: **Management → Member Management → Trial Members**.
- Dev tools (simulated date, clear data) are hidden in the trial version: on the settings page, tap the version line at the bottom 7 times to show or hide them. They are always shown in DevTools and preview builds, and never in the released version.
- Data is stored per AppID on each phone. Updating versions keeps it; changing the AppID does not.
- Never put the mini program secret key (from the developer settings page) in code or chat.

## Going public (later)

Name and icon, WeChat verification, ICP filing, service category (Tools), privacy guidelines (file selection from chats), then submit for review.
