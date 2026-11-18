"""Generate tab bar icons (81x81 PNG) for the mini program.

Run from the repo root: python3 scripts/gen-tab-icons.py
Icons are drawn as strokes at 8x and downsampled for smooth edges.
"""
from PIL import Image, ImageDraw

SIZE = 81
SCALE = 8
OUT = 'miniprogram/images/tab/'
COLORS = {'': (122, 111, 98, 255), '-on': (62, 107, 78, 255)}  # secondary, primary


def canvas():
    img = Image.new('RGBA', (SIZE * SCALE, SIZE * SCALE), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def p(*xy):
    # Icons are designed on a 24-unit grid inside an 81px square with padding.
    unit = SIZE * SCALE / 30
    off = 3 * unit
    return [off + v * unit for v in xy]


def width():
    return int(1.9 * SIZE * SCALE / 30)


def today(d, c):
    w = width()
    d.ellipse(p(8, 8, 16, 16), outline=c, width=w)
    for x1, y1, x2, y2 in [(12, 2, 12, 4.5), (12, 19.5, 12, 22), (2, 12, 4.5, 12), (19.5, 12, 22, 12),
                           (4.9, 4.9, 6.6, 6.6), (17.4, 17.4, 19.1, 19.1), (4.9, 19.1, 6.6, 17.4), (17.4, 6.6, 19.1, 4.9)]:
        d.line(p(x1, y1, x2, y2), fill=c, width=w)


def calendar(d, c):
    w = width()
    d.rectangle(p(3, 5, 21, 21), outline=c, width=w)
    d.line(p(3, 10, 21, 10), fill=c, width=w)
    d.line(p(8, 3, 8, 7), fill=c, width=w)
    d.line(p(16, 3, 16, 7), fill=c, width=w)


def shelf(d, c):
    w = width()
    d.rectangle(p(4, 4, 9, 20), outline=c, width=w)
    d.rectangle(p(10, 4, 15, 20), outline=c, width=w)
    d.line(p(16, 5.5, 20, 6.5, 17.5, 20.5, 13.5, 19.5, 16, 5.5), fill=c, width=w, joint='curve')


for name, draw in [('today', today), ('calendar', calendar), ('shelf', shelf)]:
    for suffix, color in COLORS.items():
        img, d = canvas()
        draw(d, color)
        img.resize((SIZE, SIZE), Image.LANCZOS).save(OUT + name + suffix + '.png')
