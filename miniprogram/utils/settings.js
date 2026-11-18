// Global reading settings. See requirements 3.4.

const FONT_SIZES = [30, 34, 38, 44] // rpx
const LINE_HEIGHTS = [1.6, 1.9, 2.2]
const FONTS = {
  sans: '-apple-system, "PingFang SC", "Helvetica Neue", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", "Noto Serif CJK SC", serif'
}
const THEMES = {
  light: { bg: '#ffffff', text: '#222222', secondary: '#999999', nav: '#ffffff', navText: '#000000' },
  sepia: { bg: '#f4ecd8', text: '#5b4636', secondary: '#9a8670', nav: '#f4ecd8', navText: '#000000' },
  dark: { bg: '#1c1c1e', text: '#c7c7c7', secondary: '#777777', nav: '#1c1c1e', navText: '#ffffff' }
}

const DEFAULTS = { fontSize: 1, lineHeight: 1, font: 'sans', theme: 'auto' }

function loadSettings() {
  return Object.assign({}, DEFAULTS, wx.getStorageSync('settings') || {})
}

function saveSettings(s) {
  wx.setStorageSync('settings', s)
}

function systemTheme() {
  try {
    const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
    return info.theme === 'dark' ? 'dark' : 'light'
  } catch (err) {
    return 'light'
  }
}

/** Resolved style values for the reader. */
function readerStyle(s) {
  const themeName = s.theme === 'auto' ? systemTheme() : s.theme
  const theme = THEMES[themeName] || THEMES.light
  return {
    themeName,
    theme,
    fontSize: FONT_SIZES[s.fontSize] || FONT_SIZES[1],
    lineHeight: LINE_HEIGHTS[s.lineHeight] || LINE_HEIGHTS[1],
    fontFamily: FONTS[s.font] || FONTS.sans
  }
}

module.exports = { FONTS, FONT_SIZES, LINE_HEIGHTS, loadSettings, saveSettings, readerStyle }
