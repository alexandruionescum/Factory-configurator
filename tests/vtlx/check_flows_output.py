import zipfile, re, sys
from lxml import etree
src, out = zipfile.ZipFile(sys.argv[1]), zipfile.ZipFile(sys.argv[2])
assert sorted(src.namelist()) == sorted(out.namelist())
for n in src.namelist():
    if n != 'platin_v1.xml': assert src.read(n) == out.read(n), n
raw = out.read('platin_v1.xml'); assert raw.startswith(b'\xef\xbb\xbf'), 'BOM lost'
x = raw.decode('utf-8-sig'); etree.fromstring(x.encode())
ids = re.findall(r'z:Id="(i\d+)"', x); refs = re.findall(r'z:Ref="(i\d+)"', x)
assert len(ids) == len(set(ids)), 'dup ids'
pos = {i: x.find(f'z:Id="{i}"') for i in ids}
for m in re.finditer(r'z:Ref="(i\d+)"', x):
    assert m.group(1) in pos and pos[m.group(1)] < m.start(), ('bad ref', m.group(1))
lay = out.read('LayoutData.v1.xml').decode('utf-8-sig')
guids = dict((g, n) for g, n in re.findall(r'<Guid>([^<]*)</Guid><MasterId>[^<]*</MasterId><Name>([^<]*)</Name>', lay))
pls = re.findall(r'<ProductLine z:Id="i\d+">.*?<Name>([^<]*)</Name>', x)
print('product lines', pls)
print('transports', x.count('<Transport z:Id='), 'tt defs', x.count('<TransportType z:Id='), 'old sample gone', 'Old sample' not in x)
for g in re.findall(r'<GUID>([^<]*)</GUID>', x): assert g in guids, ('unknown guid', g)
print('operations linked', len(re.findall(r'<GUID>', x)))
print('qty', re.findall(r'<Quantity>(\d+)</Quantity>', x)[:4], 'ipc', sorted(set(re.findall(r'<ItemsPerContainer>(\d+)', x))))
print('list:', re.search(r'<TransportTypeListSerialized>.*?</TransportTypeListSerialized>', x).group(0)[:200])
print('settings:', re.search(r'<Settings.*?</Settings>', x).group(0))
print('ALL CHECKS PASSED')
