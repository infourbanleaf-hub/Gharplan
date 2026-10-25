"""Dev preview: draws generated layouts (JSON from dump-layouts.ts) to a PNG with Pillow."""
import json, sys
from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
data = json.load(open(src))
FILL = {'living': '#fdf3d0', 'dining': '#fde8d0', 'kitchen': '#e6f5d8', 'master': '#d9e8fb', 'bedroom': '#dfeefa',
        'guest': '#dfeefa', 'attachedToilet': '#e8e2f5', 'commonToilet': '#e8e2f5', 'puja': '#fbe0ea',
        'study': '#eef0d8', 'store': '#eeeeee', 'utility': '#e3f1f1', 'stair': '#f2f2f2', 'passage': '#ffffff'}
S = 14  # px per foot
PAD = 70
PANEL_W = 0
panels = []
for lay in data['layouts']:
    f = lay['frame']
    W, D = f['width'], f['depth']
    panels.append((lay, W * S, D * S))
panel_w = max(w for _, w, _ in panels) + 2 * PAD
panel_h = max(h for _, _, h in panels) + 2 * PAD + 90
img = Image.new('RGB', (panel_w * len(panels), panel_h), 'white')
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 10)
    bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 14)
except Exception:
    font = small = bold = ImageFont.load_default()

def ft(v):
    i = round(v * 12)
    return f"{i // 12}'{i % 12}\""

for k, (lay, pw, ph) in enumerate(panels):
    ox = k * panel_w + PAD
    f = lay['frame']
    W, D = f['width'], f['depth']
    def X(x): return ox + x * S
    def Y(y): return PAD + (D - y) * S
    # plot boundary (dashed look: thin grey) and setback box
    d.rectangle([X(0), Y(D), X(W), Y(0)], outline='#999999', width=1)
    b = f['buildable']
    d.rectangle([X(b['x']), Y(b['y'] + b['h']), X(b['x'] + b['w']), Y(b['y'])], outline='#cc5555', width=1)
    for r in lay['rooms']:
        rc = r['rect']
        d.rectangle([X(rc['x']), Y(rc['y'] + rc['h']), X(rc['x'] + rc['w']), Y(rc['y'])],
                    fill=FILL.get(r['kind'], '#ffffff'), outline='#333333', width=3)
        cx = X(rc['x'] + rc['w'] / 2); cy = Y(rc['y'] + rc['h'] / 2)
        if r['kind'] != 'passage':
            label = r['label']
            d.text((cx, cy - 16), label, fill='#111111', font=small, anchor='mm')
            d.text((cx, cy), f"{ft(rc['w'])} x {ft(rc['h'])}", fill='#1f4e8c', font=small, anchor='mm')
            d.text((cx, cy + 14), r['compass'], fill='#777777', font=small, anchor='mm')
    for o in lay['openings']:
        col = '#2a7fd4' if o['kind'] in ('window', 'ventilator') else ('#c00000' if o['kind'] in ('mainDoor', 'door') else '#888888')
        w = 4 if o['kind'] in ('window', 'mainDoor', 'door') else 3
        d.line([X(o['a']['x']), Y(o['a']['y']), X(o['b']['x']), Y(o['b']['y'])], fill=col, width=w)
    for p in lay['parking']:
        rc = p['rect']
        d.rectangle([X(rc['x']), Y(rc['y'] + rc['h']), X(rc['x'] + rc['w']), Y(rc['y'])], fill='#eeeeee', outline='#777777', width=1)
        d.text((X(rc['x'] + rc['w'] / 2), Y(rc['y'] + rc['h'] / 2)), 'Car' if p['kind'] == 'car' else '2W', fill='#555555', font=small, anchor='mm')
    # north arrow: world north relative to local frame
    rx, ry = f['right']; ix, iy = f['inward']
    nxv = -ix; nyv = -iy  # north is (0,1) in world; local coords of north: x = dot(N, right), y = dot(N, inward)
    lx = 0 * rx + 1 * ry
    ly = 0 * ix + 1 * iy
    ax, ay = ox + W * S + 30, PAD + 30
    d.line([ax, ay + 20, ax + lx * 22, ay + 20 - ly * 22], fill='#000000', width=2)
    d.text((ax + lx * 28, ay + 20 - ly * 28), 'N', fill='#000000', font=bold, anchor='mm')
    s = lay['scorecard']
    lines = [
        f"{lay['id']}   total score {s['total']:.0f}",
        f"Carpet {s['carpetArea']:.0f} sq ft  |  Built-up {s['builtUpArea']:.0f} sq ft  |  Coverage {s['groundCoverage']*100:.0f}%",
        f"Efficiency {s['efficiency']:.0f}%  |  Circulation {s['circulation']:.1f}%  |  Ventilation {s['ventilation']:.0f}  |  Vastu {('n/a' if s['vastu'] is None else f'{s[chr(118)+chr(97)+chr(115)+chr(116)+chr(117)]:.0f}')}",
    ]
    for i, t in enumerate(lines):
        d.text((ox, PAD + D * S + 22 + i * 18), t, fill='#222222', font=font if i == 0 else small)
d.text((PAD, 14), data['name'], fill='#000000', font=bold)
img.save(out)
print('saved', out, img.size)
