"""Shared helpers for add-only generation on top of a Pack and Go (global mm coordinates)."""
import sys, re, math, uuid, copy, html
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vtlx_lib import Vtlx
from parse8 import parse
BLK = 'fec0e408'
class Gen:
    def __init__(s, src, work):
        s.v = Vtlx(src, work); s.O = parse(s.v.xml); s.G = {o['guid']: o for o in s.O}
        s.rooms = {o['name']: s.bb(o) for o in s.O if o['m'].startswith(BLK) and o['layer'] == 'A Block layout'}
        s.lanes = [s.bb(o) for o in s.O if o['m'].startswith(BLK) and o['layer'] in ('A Circulation', 'Block layout') and o['z'] >= 10 and o['H'] <= 10]
        s.n = 0; s.log = []
    @staticmethod
    def bb(o):
        w, l = (o['W'], o['L']) if abs(o['a']) % 180 == 0 else (o['L'], o['W'])
        return (o['x'] - w / 2, o['y'] - l / 2, o['x'] + w / 2, o['y'] + l / 2)
    def room(s, name): return [b for n, b in s.rooms.items() if n.startswith(name)][0]
    def sample(s, p):
        c = [o for o in s.O if o['m'].startswith(p)] or [o for o in s.O if o['guid'].startswith(p)]
        assert c, p; return c[0]
    def base(s, x, y):
        z = 10 if any(b[0] - 1 <= x <= b[2] + 1 and b[1] - 1 <= y <= b[3] + 1 for b in s.rooms.values()) else 0
        if any(b[0] - 1 <= x <= b[2] + 1 and b[1] - 1 <= y <= b[3] + 1 for b in s.lanes): z = 20
        return z
    def add(s, p, x, y, ang=0, zrel=0, name=None, L=None, W=None, absz=None, hg=None, extra=None):
        v = s.v; src = s.sample(p); tg = src['guid']
        st, en = v.span(tg); b = v.xml[st:en]
        def rid(m): v.nid += 1; return f'z:Id="i{v.nid}"'
        b = re.sub(r'z:Id="i\d+"', rid, b); g = str(uuid.uuid4())
        rep = lambda tag, val, b: re.sub(f'<{tag}>[^<]*</{tag}>', f'<{tag}>{val}</{tag}>', b, 1)
        z = absz if absz is not None else s.base(x, y) + zrel
        b = rep('Guid', g, b); b = rep('PosX', round(x), b); b = rep('PosY', round(y), b); b = rep('Angle', f'{ang:g}' if ang else '-0', b)
        b = rep('PosZ', round(z), b); b = rep('HeadOfGroup', hg or '00000000-0000-0000-0000-000000000000', b)
        if name: b = rep('Name', html.escape(name, quote=False), b)
        if L: b = rep('Length', round(L), b)
        if W: b = rep('Width', round(W), b)
        for k, val in (extra or {}).items(): b = rep(k, val, b)
        v.new_xml.append(b)
        ki, ka, kq = v.trio(tg); ins, att, seq = [copy.deepcopy(v.O[k]) for k in (ki, ka, kq)]
        if L: ins['scale'][1] = ins['scale'][1] * L / src['L']
        if W: ins['scale'][0] = ins['scale'][0] * W / src['W']
        hi, ha, hq = v.hs, v.hs + 1, v.hs + 2; v.hs += 3; rot = math.radians(ang % 360)
        ins['handle'] = [0, 2, hi]; ins['ins_pt'] = [float(x), float(y), 0.0]; ins['rotation'] = rot; ins['attribs'] = [[3, 2, ha, ha]]; ins['seqend'] = [3, 2, hq, hq]
        att['handle'] = [0, 2, ha]; att['ownerhandle'] = [4, 2, hi, hi]; att['ins_pt'] = [float(x), float(y)]; att['text_value'] = g
        if rot: att['rotation'] = rot
        else: att.pop('rotation', None)
        seq['handle'] = [0, 2, hq]; seq['ownerhandle'] = [4, 2, hi, hi]
        pos = max(k for k, o in enumerate(v.O) if o.get('entity') == 'SEQEND') + 1
        v.O[pos:pos] = [ins, att, seq]
        v.ms['entities'].append([3, 2, hi, hi]); s.n += 1
        s.log.append(dict(p=p, x=x, y=y, ang=ang, z=z, name=name or src['name'], W=W or src['W'], L=L or src['L'], H=src['H']))
        return g
    def lane(s, name, x0, y0, w, h, col='#FFF8CBAD'):
        s.add('68d3a652', x0 + w / 2, y0 + h / 2, 0, name=name, W=w, L=h, absz=10, extra={'Color2D': col})
        s.lanes.append((x0, y0, x0 + w, y0 + h))
    def line(s, p, q):
        L = math.dist(p, q); ang = 0 if abs(p[0] - q[0]) < 1 else 90
        s.add('adc6df66', (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, ang, 0, L=L)
    def finish(s, out, remove=()):
        for o in s.v.O: pass
        for n, o in enumerate(s.v.O): o['index'] = n
        for g in remove: s.v.remove(g)
        s.v.save(out)

def _attidx(v):
    return {o.get('text_value'): k for k, o in enumerate(v.O) if o.get('entity') == 'ATTRIB'}
def gen_edit(s, guid, x=None, y=None, z=None, ang=None, head=None, aidx=None, W=None, L=None):
    """edit an EXISTING object in place (XML + DWG). Call before any add() (DWG indexes)."""
    v = s.v; st, en = v.span(guid); b = v.xml[st:en]
    rep = lambda tag, val, b: re.sub(f'<{tag}>[^<]*</{tag}>', f'<{tag}>{val}</{tag}>', b, 1)
    o = s.G[guid]
    if x is not None: b = rep('PosX', round(x), b)
    if y is not None: b = rep('PosY', round(y), b)
    if z is not None: b = rep('PosZ', round(z), b)
    if ang is not None: b = rep('Angle', f'{ang:g}' if ang else '-0', b)
    if head is not None: b = rep('HeadOfGroup', head, b)
    if W is not None: b = rep('Width', round(W), b)
    if L is not None: b = rep('Length', round(L), b)
    v.xml = v.xml[:st] + b + v.xml[en:]
    if x is None and y is None and ang is None and W is None and L is None: return
    k = (aidx or _attidx(v))[guid]; att, ins = v.O[k], v.O[k - 1]
    if W is not None: ins['scale'][0] = ins['scale'][0] * W / o['W']
    if L is not None: ins['scale'][1] = ins['scale'][1] * L / o['L']
    dx = (x - o['x']) if x is not None else 0; dy = (y - o['y']) if y is not None else 0
    ins['ins_pt'] = [ins['ins_pt'][0] + dx, ins['ins_pt'][1] + dy, ins['ins_pt'][2]]
    att['ins_pt'] = [att['ins_pt'][0] + dx, att['ins_pt'][1] + dy]
    if ang is not None:
        r = math.radians(ang % 360); ins['rotation'] = r
        if r: att['rotation'] = r
        else: att.pop('rotation', None)
    o.update({k2: v2 for k2, v2 in (('x', x), ('y', y), ('z', z), ('a', ang), ('W', W), ('L', L)) if v2 is not None})
Gen.edit = gen_edit
