// Placeholder covers for books without a cover image: a soft paper tone
// with matching ink, picked from the title so a book always looks the same.

const PALETTE = [
  { bg: '#E9D7C6', ink: '#4A2F22', sub: '#7A5A48' }, // clay
  { bg: '#D5DDE3', ink: '#22323F', sub: '#4B5E6D' }, // slate
  { bg: '#DCE3D3', ink: '#2A3A26', sub: '#55664E' }, // sage
  { bg: '#EFE2C2', ink: '#45361A', sub: '#76643C' }, // ochre
  { bg: '#E4D6DE', ink: '#43293A', sub: '#715466' }, // plum
  { bg: '#D6E2DE', ink: '#20372F', sub: '#4A6359' } // teal
]

function placeholderTone(title) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

module.exports = { placeholderTone }
