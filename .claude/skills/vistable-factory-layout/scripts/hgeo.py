"""geometry of plan_h records: footprints (world rects / polygons) for check + sketch"""
import math
from a6lib import rz
def rect(W, L, x, y, a):
    c, s = math.cos(math.radians(a)), math.sin(math.radians(a)); w, l = W / 2, L / 2
    return [(x + c * dx - s * dy, y + s * dx + c * dy) for dx, dy in ((-w, -l), (w, -l), (w, l), (-w, l))]
def parts(rec, P, G):
    """yield (name, polygon, z, H, role) for every object of a record"""
    kind, key, x, y, ang, zn, ex = rec
    if kind in ('post', 'clu', 'group'):
        cl = P[key] if kind != 'group' else None
        if cl is None:
            from a6lib import Cluster, members_of
            return []
        out = []
        for o, lx, ly, da in cl.local():
            px, py = rz(ang, lx, ly)
            out.append((o['name'], rect(o['W'], o['L'], x + px, y + py, ang + da), o['z'] - cl.a['z'], o['H'], 'anchor' if o is cl.a else 'member'))
        return out
    o = G[key]
    return [(ex.get('name', o['name']), rect(ex.get('W', o['W']), ex.get('L', o['L']), x, y, ang), ex.get('z', 10), o['H'], kind)]
def bb(poly):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]; return min(xs), min(ys), max(xs), max(ys)
