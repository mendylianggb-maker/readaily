// A book cover: the imported cover image, or a paper-toned placeholder with
// the title and author set horizontally.
const { placeholderTone } = require('../../utils/cover')

Component({
  properties: {
    title: { type: String, value: '' },
    author: { type: String, value: '' },
    coverPath: { type: String, value: '' },
    size: { type: String, value: 'small' } // small (home) | large (bookshelf)
  },

  data: {
    tone: null
  },

  observers: {
    title(title) {
      this.setData({ tone: placeholderTone(title || '') })
    }
  }
})
