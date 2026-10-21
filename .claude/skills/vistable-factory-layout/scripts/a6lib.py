"""Helpers for furnishing A6 rooms by copying clusters (post + chair + person + items) from the old Option A layout."""
import math, json
def rz(a, x, y):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a)); return c * x - s * y, s * x + c * y
def fp(o):
    w, l = o['W'] / 2, o['L'] / 2
    return [rz(o['a'], dx, dy) for dx, dy in ((-w, -l), (w, -l), (w, l), (-w, l))]
def nang(a):
    a = (a + 180) % 360 - 180
    return 180.0 if abs(a + 180) < 1e-6 else a
class Cluster:
    """objects copied as one unit; anchor = the main object (on the floor)."""
    def __init__(s, anchor, members):
        s.a = anchor; s.m = [anchor] + [o for o in members if o['guid'] != anchor['guid']]
    def local(s):
        A = s.a; out = []
        for o in s.m:
            lx, ly = rz(-A['a'], o['x'] - A['x'], o['y'] - A['y']); out.append((o, lx, ly, o['a'] - A['a']))
        return out
    def bbox(s, ang):
        """world-axis bbox of the cluster placed at (0,0) with anchor angle ang"""
        xs, ys = [], []
        for o, lx, ly, da in s.local():
            px, py = rz(ang, lx, ly); q = dict(o, a=ang + da)
            for cx, cy in fp(q): xs.append(px + cx); ys.append(py + cy)
        return min(xs), min(ys), max(xs), max(ys)
    def operator_vec(s):
        """anchor-local vector from anchor to its operator (person or chair), or None"""
        ppl = [o for o in s.m[1:] if any(k in o['name'] for k in ('sitting', 'standing', 'chair'))]
        if not ppl: return None
        lx = sum(rz(-s.a['a'], o['x'] - s.a['x'], o['y'] - s.a['y'])[0] for o in ppl) / len(ppl)
        ly = sum(rz(-s.a['a'], o['x'] - s.a['x'], o['y'] - s.a['y'])[1] for o in ppl) / len(ppl)
        return lx, ly
    def south_angle(s):
        v = s.operator_vec()
        if v is None: return 0.0
        best = None
        for a in (0, 90, 180, -90):
            wx, wy = rz(a, *v)
            if best is None or wy < best[1]: best = (a, wy)
        return float(best[0])
def place(g, cl, x, y, ang, floor=10, rename=None, newgroup=True, extra_layer=None, log=None):
    """copy the cluster with its anchor at (x,y,ang); all parts become one new group headed by the anchor copy"""
    A = cl.a; head = None; ids = []
    if A['z'] > 100: floor += A['z'] - 10          # elevated anchor (e.g. a tabletop at 0.81 m): keep its height above the floor
    for o, lx, ly, da in cl.local():
        px, py = rz(ang, lx, ly)
        nm = rename.get(o['guid']) if rename else None
        ex = {'Layer': extra_layer} if (extra_layer and o['guid'] == A['guid']) else None
        gid = g.add(o['guid'], x + px, y + py, nang(ang + da), name=nm, absz=o['z'] - A['z'] + floor,
                    hg=(head if newgroup else None), extra=ex)
        if head is None and newgroup:
            g.v.new_xml[-1] = g.v.new_xml[-1].replace('<HeadOfGroup>00000000-0000-0000-0000-000000000000</HeadOfGroup>', f'<HeadOfGroup>{gid}</HeadOfGroup>')
            head = gid
        ids.append(gid)
    if log is not None: log.append((A['name'], round(x), round(y), ang, len(ids)))
    return ids
def members_of(O, anchor, with_group=True, with_top=True):
    out = []
    if with_group and anchor['hg'] == anchor['guid']:
        out += [o for o in O if o['hg'] == anchor['guid'] and o['guid'] != anchor['guid']]
    if with_top:
        poly = fp(anchor); xs = [anchor['x'] + p[0] for p in poly]; ys = [anchor['y'] + p[1] for p in poly]
        out += [o for o in O if o['guid'] != anchor['guid'] and o not in out and o['z'] > anchor['z'] + 200
                and min(xs) <= o['x'] <= max(xs) and min(ys) <= o['y'] <= max(ys) and not o['m'].startswith('fec0e408')]
    return out
