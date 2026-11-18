// Shared UI helpers.

const MINUTE_OPTIONS = [5, 10, 15, 20]

/** Ask for daily reading minutes. Resolves to a number, or null if cancelled. */
function chooseDailyMinutes(title) {
  return new Promise((resolve) => {
    wx.showActionSheet({
      alertText: title || '每天读多久？',
      itemList: MINUTE_OPTIONS.map((m) => '每天 ' + m + ' 分钟' + (m === 10 ? '（推荐）' : '')),
      success: (res) => resolve(MINUTE_OPTIONS[res.tapIndex]),
      fail: () => resolve(null)
    })
  })
}

function confirm(title, content, confirmText) {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText: confirmText || '确定',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    })
  })
}

const BOOKMARK_EXPLAINER =
  '连续打卡 14 天，就能得到一张时光书签，最多存 3 张。\n\n' +
  '它可以把日历上一个黄色的「补读」日变成绿色的「按时完成」，就像把书签插回那一天。\n\n' +
  '使用方法：在日历页点顶部的书签数量，再点一个黄色的日子。'

module.exports = { MINUTE_OPTIONS, chooseDailyMinutes, confirm, BOOKMARK_EXPLAINER }
