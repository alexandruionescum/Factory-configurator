"""quick 3D box view (bounding boxes from the exported XML) of a window of the layout"""
import json, sys, math, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
add = json.load(open(sys.argv[1])); x0, x1, y0, y1 = map(float, sys.argv[2].split(',')); OUT = sys.argv[3]; title = sys.argv[4]
def col(n):
    n = n.lower()
    for k_, c_ in (('eo exhaust', '#C62828'), ('supply air', '#1E88E5'), ('purified water', '#00ACC1'), ('compressed air', '#43A047'), ('eo feed', '#8E24AA'), ('ahu', '#4FB0C6'), ('chiller', '#7E57C2'), ('wet scrubber', '#78909C')):
        if k_ in n and 'skid' not in n and 'receiver' not in n: return c_
    if 'stayer' in n: return '#37474F'
    if 'crane kit rail' in n or 'girder' in n or 'mounting' in n or 'running gear' in n or 'rod' in n or 'plate' in n: return '#546E7A'
    if 'crane kit crane' in n or 'hook' in n or 'tube' in n: return '#FF6F00'
    if 'sitting' in n or 'standing' in n: return '#E2463F'
    if 'dolly' in n: return '#81C784'
    if 'workbench' in n or 'tabletop' in n: return '#5B8FD9'
    if 'envelope' in n or 'protected' in n: return '#FFCC80'
    if 'div' in n: return '#FFC800'
    return '#B0BEC5'
fig = plt.figure(figsize=(16, 11)); ax = fig.add_subplot(111, projection='3d')
polys, cols = [], []
for o in add:
    if not (x0 < o['x'] < x1 and y0 < o['y'] < y1): continue
    if o['H'] < 1 or 'footprint' in o['name'].lower() or 'tray' in o['name'].lower() or 'box 400' in o['name'].lower(): continue
    a = math.radians(o['a']); c, s = math.cos(a), math.sin(a); w, l = o['W'] / 2, o['L'] / 2
    pts = [(o['x'] + c * dx - s * dy, o['y'] + s * dx + c * dy) for dx, dy in ((-w, -l), (w, -l), (w, l), (-w, l))]
    z0, z1 = o['z'], o['z'] + max(o['H'], 10)
    b = [(p[0], p[1], z0) for p in pts]; t = [(p[0], p[1], z1) for p in pts]
    fc = col(o['name'])
    polys += [b, t] + [[b[i], b[(i + 1) % 4], t[(i + 1) % 4], t[i]] for i in range(4)]; cols += [fc] * 6
pc = Poly3DCollection(polys, facecolors=cols, edgecolors='#333', linewidths=0.15, alpha=0.95); ax.add_collection3d(pc)
ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_zlim(0, 6000)
ax.set_box_aspect((x1 - x0, y1 - y0, 6000)); ax.view_init(elev=32, azim=-60); ax.set_axis_off()
ax.set_title(title, fontsize=12)
fig.savefig(OUT, dpi=90, bbox_inches='tight')
