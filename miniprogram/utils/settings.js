// Global reading settings. See requirements 3.4.

const FONT_SIZES = [30, 34, 38, 44] // rpx
const LINE_HEIGHTS = [1.6, 1.9, 2.2]
const FONTS = {
  sans: '-apple-system, "PingFang SC", "Helvetica Neue", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", "STSong", "Noto Serif CJK SC", serif'
}
// "paper" matches the app's own background; "auto" uses paper by day and dark at night.
const THEMES = {
  paper: { bg: '#F6F1E7', text: '#2B2620', secondary: '#7A6F62', line: '#E6DDCD', accent: '#3E6B4E', nav: '#F6F1E7', navText: '#000000' },
  light: { bg: '#FFFFFF', text: '#222222', secondary: '#8A8A8A', line: '#EEEEEE', accent: '#3E6B4E', nav: '#FFFFFF', navText: '#000000' },
  dark: { bg: '#1E1C1A', text: '#CFC8BC', secondary: '#8A8378', line: '#3A3632', accent: '#7FA88B', nav: '#1E1C1A', navText: '#ffffff' }
}

const DEFAULTS = { fontSize: 1, lineHeight: 1, font: 'serif', theme: 'auto' }

function loadSettings() {
  const s = Object.assign({}, DEFAULTS, wx.getStorageSync('settings') || {})
  if (s.theme === 'sepia') s.theme = 'paper' // renamed in the design pass
  return s
}

function saveSettings(s) {
  wx.setStorageSync('settings', s)
}

function systemTheme() {
  try {
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
    return info.theme === 'dark' ? 'dark' : 'paper'
  } catch (err) {
    return 'paper'
  }
}

/** Resolved style values for the reader. */
function readerStyle(s) {
  const themeName = s.theme === 'auto' ? systemTheme() : s.theme
  const theme = THEMES[themeName] || THEMES.paper
  return {
    themeName,
    theme,
    fontSize: FONT_SIZES[s.fontSize] || FONT_SIZES[1],
    lineHeight: LINE_HEIGHTS[s.lineHeight] || LINE_HEIGHTS[1],
    fontFamily: FONTS[s.font] || FONTS.serif
  }
}

module.exports = { FONTS, FONT_SIZES, LINE_HEIGHTS, loadSettings, saveSettings, readerStyle }
