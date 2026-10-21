"""Mesh-level clash audit of a Pack and Go: which objects really intersect (not just bbox)."""
import json, sys, glob, os, re, math, zipfile, io, collections
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.environ.get('VT_ASSETS', 'assets')   # folder with <MasterId>/*.obj (copy of C:\\ProgramData\\visTABLE\\assets)
from parse8 import parse
VT = sys.argv[1]; OUTJ = sys.argv[2]
z = zipfile.ZipFile(VT); xml = z.read('LayoutData.v1.xml').decode('utf-8-sig'); O = parse(xml)
names = z.namelist()
def load_obj_text(t, unit=1.0):
    V = []; F = []
    for l in t.splitlines():
        if l.startswith('v '): V.append([float(a) for a in l.split()[1:4]])
        elif l.startswith('f '):
            idx = [int(p.split('/')[0]) for p in l.split()[1:]]
            for k in range(1, len(idx) - 1): F.append((idx[0], idx[k], idx[k + 1]))
    V = np.array(V) * unit
    if not len(V): return None
    F = np.array(F); F = np.where(F > 0, F - 1, F + len(V))
    P = np.vstack([V, V[F].mean(1)]) if len(F) else V
    return P
MESH = {}
def mesh(m):
    if m in MESH: return MESH[m]
    P = None
    f = glob.glob(f'{ASSETS}/{m}/*.obj')
    if f: P = load_obj_text(open(f[0], errors='ignore').read())
    else:
        objs = [n for n in names if n.startswith(f'models\\{m}\\') and n.endswith('.obj')]
        if objs: P = load_obj_text(z.read(objs[0]).decode('utf-8', 'ignore'))
    if P is not None:
        mn, mx = P.min(0), P.max(0); ext = mx - mn; ext[ext == 0] = 1e-9
        P = (P - np.array([(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, mn[2]])) / ext   # unit box: x,y in [-.5,.5], z in [0,1]
        if len(P) > 6000: P = P[np.random.default_rng(0).choice(len(P), 6000, replace=False)]
    MESH[m] = P; return P
UNIT = np.array([[x, y, zz] for x in (-.5, .5) for y in (-.5, .5) for zz in (0, 1)] + [[0, 0, .5]])
SKIP_L = ('A Block layout', 'A Divider lines', 'Block layout', 'B Block layout', 'B Circulation', 'B Docks')
def skip(o):
    n = o['name'].lower()
    if o['layer'] in SKIP_L: return True
    if o['m'].startswith('fec0e408') and o['H'] <= 12: return True
    return any(s in n for s in ('signal', 'man standing', 'woman standing', 'man sitting', 'woman sitting', 'person', 'mat 600', 'footprint', 'lane'))
objs = [o for o in O if not skip(o)]
def pts(o):
    P = UNIT if o['m'].startswith(('fec0e408', 'e8c0d9d1')) else mesh(o['m'])
    if P is None: P = UNIT
    a = math.radians(o['a']); c, s = math.cos(a), math.sin(a)
    L = P * np.array([o['W'], o['L'], o['H']])
    X = o['x'] + c * L[:, 0] - s * L[:, 1]; Y = o['y'] + s * L[:, 0] + c * L[:, 1]
    return np.c_[X, Y, o['z'] + L[:, 2]]
def inside(Pw, o, sh=15):
    a = math.radians(o['a']); c, s = math.cos(a), math.sin(a)
    dx, dy = Pw[:, 0] - o['x'], Pw[:, 1] - o['y']
    lx, ly = c * dx + s * dy, -s * dx + c * dy; lz = Pw[:, 2] - o['z']
    return int(((abs(lx) < o['W'] / 2 - sh) & (abs(ly) < o['L'] / 2 - sh) & (lz > sh) & (lz < o['H'] - sh)).sum())
W = {}
for o in objs:
    P = pts(o); W[o['guid']] = (P, P.min(0), P.max(0))
grid = collections.defaultdict(list)
for o in objs:
    _, mn, mx = W[o['guid']]
    for gx in range(int(mn[0] // 2000), int(mx[0] // 2000) + 1):
        for gy in range(int(mn[1] // 2000), int(mx[1] // 2000) + 1): grid[(gx, gy)].append(o)
seen = set(); res = []
def solid(o):   # objects whose bbox ~ solid volume: blocks, boxes, cabinets
    return o['m'].startswith(('fec0e408', 'e8c0d9d1'))
for cell, L in grid.items():
    for i in range(len(L)):
        for j in range(i + 1, len(L)):
            a, b = L[i], L[j]; key = tuple(sorted((a['guid'], b['guid'])))
            if key in seen: continue
            seen.add(key)
            if a['hg'] and a['hg'] == b['hg'] and not a['hg'].startswith('0000'): continue
            _, amn, amx = W[a['guid']]; _, bmn, bmx = W[b['guid']]
            ov = np.minimum(amx, bmx) - np.maximum(amn, bmn)
            if (ov < 20).any(): continue
            va, vb = a['W'] * a['L'] * a['H'], b['W'] * b['L'] * b['H']
            big, small = (a, b) if va >= vb else (b, a)
            nab = inside(W[big['guid']][0], small); nba = inside(W[small['guid']][0], big) if solid(big) else 0
            if nab + nba >= 4:
                res.append(dict(a=a['name'], b=b['name'], ga=a['guid'], gb=b['guid'], nab=nab, nba=nba, x=round((a['x'] + b['x']) / 2), y=round((a['y'] + b['y']) / 2), za=a['z'], zb=b['z'], ov=[round(v) for v in ov]))
json.dump(res, open(OUTJ, 'w'), indent=0)
print(len(objs), 'objects checked,', len(res), 'mesh clashes')
