// Placeholder covers for books without a cover image.
// Final style is decided in the design pass.

const PALETTE = ['#5b8c6e', '#8a6f5c', '#5c7a99', '#a0665c', '#7a6c99', '#6b8f8a']

function placeholderColor(title) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

module.exports = { placeholderColor }
