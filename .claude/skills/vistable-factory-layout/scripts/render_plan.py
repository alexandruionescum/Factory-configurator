import json, math, sys, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt, matplotlib.patches as P
base = json.load(open(sys.argv[1])); add = json.load(open(sys.argv[2])) if sys.argv[2] != '-' else []
lim = tuple(map(float, sys.argv[3].split(','))); out = sys.argv[4]; title = sys.argv[5]
O = base + add
def rect(o):
    a = math.radians(o['a']); c, s = math.cos(a), math.sin(a); w, l = o['W'] / 2, o['L'] / 2
    return [(o['x'] + c * dx - s * dy, o['y'] + s * dx + c * dy) for dx, dy in ((-w, -l), (w, -l), (w, l), (-w, l))]
def col(o):
    n = o['name'].lower()
    if 'tray' in n: return None
    if 'rational rack' in n or 'transport cart' in n: return '#9AA8B5'
    if 'carton' in n or n.startswith('box'): return '#C8A26B'
    if 'pallet' in n: return '#E3C58F'
    if 'sitting' in n or 'standing' in n: return '#E2463F'
    if 'chair' in n: return '#555555'
    if 'microscope' in n or 'label printer' in n: return '#3b7dd8'
    if 'inclined shelf' in n or 'dolly' in n: return '#B7C9A8'
    return '#C9D3DC'
x0, x1, y0, y1 = lim
fig = plt.figure(figsize=(14, 14 * (y1 - y0) / (x1 - x0) + 0.6)); ax = fig.add_axes([0.01, 0.01, 0.98, 0.97])
for o in sorted(O, key=lambda o: o['z']):
    if not (x0 - 3000 < o['x'] < x1 + 3000 and y0 - 3000 < o['y'] < y1 + 3000): continue
    n = o['name']
    if o['layer'] in ('A6 Block layout', 'A6 Reserve'):
        ax.add_patch(P.Polygon(rect(o), fc='#EEF4FB', ec='#666', lw=0.8, zorder=0)); ax.text(o['x'] - o['W'] / 2 + 200, o['y'] + o['L'] / 2 - 200, n[3:30], fontsize=8, va='top', fontweight='bold', color='#1f4e8c', zorder=30, clip_on=True); continue
    if o['layer'] == 'A6 Divider lines':
        ax.add_patch(P.Polygon(rect(o), fc='#FFD100', ec='none', zorder=25)); continue
    if 'Footprint' in n or 'Fork lift' in n or 'Arrow' in n or 'Line signal' in n:
        ax.add_patch(P.Polygon(rect(o), fc='#E6B800', ec='#7a6000', lw=0.3, zorder=26)); continue
    if o['layer'] == 'A6 Circulation':
        ax.add_patch(P.Polygon(rect(o), fc=('#E2EFDA' if 'people way' in n else '#FFF2CC'), ec='none', zorder=1)); continue
    if o['layer'] in ('A Block layout', 'A Divider lines', 'B Block layout') or o['layer'].startswith('A6 Docks') or o['layer'] == 'A Circulation': continue
    c = col(o)
    if c is None: continue
    ax.add_patch(P.Polygon(rect(o), fc=c, ec='#333', lw=0.3, zorder=2 + o['z'] / 1000))
ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect('equal'); ax.set_xticks([]); ax.set_yticks([]); ax.set_title(title, loc='left', fontsize=11)
fig.savefig(out, dpi=85)
