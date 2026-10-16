"""Draws the MUSD Books icon (512x512) and a 1200x630 cover with Pillow. No external assets."""
from PIL import Image, ImageDraw, ImageFont
import os

NAVY = (11, 18, 32); NAVY2 = (22, 33, 56); PAPER = (244, 247, 252); INK = (31, 41, 64)
TEAL = (45, 190, 170); ORANGE = (247, 147, 26); WHITE = (255, 255, 255); MUTED = (150, 165, 195)
S = 4  # supersampling factor

def font(name, size):
    for base in (r"C:\Windows\Fonts", "/usr/share/fonts/truetype/dejavu"):
        p = os.path.join(base, name)
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def icon(px=512):
    W = px * S
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = W / 512.0
    d.rounded_rectangle([0, 0, W - 1, W - 1], radius=int(112 * u), fill=NAVY)
    # soft inner panel
    d.rounded_rectangle([int(24 * u), int(24 * u), W - int(24 * u), W - int(24 * u)], radius=int(92 * u), fill=NAVY2)
    # ledger page
    x0, y0, x1, y1 = 118 * u, 96 * u, 394 * u, 416 * u
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(26 * u), fill=PAPER)
    # spine tab on the left
    d.rounded_rectangle([x0 - 22 * u, y0 + 24 * u, x0 + 10 * u, y1 - 24 * u], radius=int(14 * u), fill=TEAL)
    # ledger rows: label bar + amount bar
    ry = y0 + 52 * u
    for i, (lw, aw) in enumerate([(110, 62), (86, 74), (122, 50), (98, 66)]):
        y = ry + i * 50 * u
        d.rounded_rectangle([x0 + 34 * u, y, x0 + (34 + lw) * u, y + 14 * u], radius=int(7 * u), fill=INK)
        d.rounded_rectangle([x1 - (34 + aw) * u, y, x1 - 34 * u, y + 14 * u], radius=int(7 * u), fill=TEAL)
    # total rule
    d.rectangle([x0 + 34 * u, ry + 4 * 50 * u - 6 * u, x1 - 34 * u, ry + 4 * 50 * u - 3 * u], fill=INK)
    # verified badge
    cx, cy, r = 372 * u, 372 * u, 70 * u
    d.ellipse([cx - r - 10 * u, cy - r - 10 * u, cx + r + 10 * u, cy + r + 10 * u], fill=NAVY2)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=ORANGE)
    d.line([(cx - 34 * u, cy + 2 * u), (cx - 8 * u, cy + 28 * u), (cx + 36 * u, cy - 26 * u)], fill=WHITE, width=int(16 * u), joint="curve")
    for (px_, py_) in [(cx - 34 * u, cy + 2 * u), (cx - 8 * u, cy + 28 * u), (cx + 36 * u, cy - 26 * u)]:
        d.ellipse([px_ - 8 * u, py_ - 8 * u, px_ + 8 * u, py_ + 8 * u], fill=WHITE)
    return im.resize((px, px), Image.LANCZOS)

def cover(w=1200, h=630):
    im = Image.new("RGB", (w, h), NAVY)
    d = ImageDraw.Draw(im)
    for i in range(h):  # vertical gradient
        t = i / h
        d.line([(0, i), (w, i)], fill=tuple(int(NAVY[k] * (1 - t) + NAVY2[k] * t) for k in range(3)))
    ic = icon(300)
    im.paste(ic, (90, (h - 300) // 2), ic)
    d.text((440, 190), "MUSD Books", font=font("segoeuib.ttf", 92), fill=WHITE)
    d.text((444, 306), "Verifiable MUSD statements and", font=font("segoeui.ttf", 40), fill=MUTED)
    d.text((444, 356), "invoice-referenced payments on Mezo", font=font("segoeui.ttf", 40), fill=MUTED)
    d.rounded_rectangle([444, 448, 444 + 560, 448 + 52], radius=26, fill=TEAL)
    d.text((470, 455), "Reconciles to the wei  \u00b7  anchored onchain", font=font("segoeuib.ttf", 26), fill=NAVY)
    return im

if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "docs", "assets")
    os.makedirs(out, exist_ok=True)
    icon(512).save(os.path.join(out, "icon-512.png"))
    icon(256).save(os.path.join(out, "icon-256.png"))
    icon(64).save(os.path.join(out, "favicon.png"))
    cover().save(os.path.join(out, "cover-1200x630.png"))
    print("ok")
