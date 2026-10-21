import zipfile, re, sys
src = zipfile.ZipFile(sys.argv[1]).read('LayoutData.v1.xml').decode('utf-8-sig')
out = zipfile.ZipFile(sys.argv[2]).read('LayoutData.v1.xml').decode('utf-8-sig')
assert 'np.' not in out and not re.search(r'>-?(NaN|nan|inf)<', out)
blk = lambda x: re.findall(r'<d2p1:anyType z:Id="i\d+" i:type="PhysicalLayoutObject">.*?<ShowLabel>[^<]*</ShowLabel>\s*</d2p1:anyType>', x, re.S)
S = {re.search(r'<Guid>([^<]+)', b).group(1): b for b in blk(src)}
N = blk(out); print('objects', len(N))
num = re.compile(r'<((?:d4p1:)?(?:X|Y|Z|PosX|PosY|PosZ|Angle|Length|Width|zHeight|_x|_y|_z|FontSize))>([^<]*)</')
bad = 0
for b in N:
    for t, v in num.findall(b):
        try: float(v)
        except: bad += 1; print('BAD', t, v[:60]) if bad < 10 else None
masks = lambda b: re.sub(r'>[^<]*<', '><', re.sub(r'z:(Id|Ref)="i\d+"', '', b))
shape = {}
for b in blk(src):
    m = re.search(r'<MasterId>([^<]+)', b).group(1); shape.setdefault(m, set()).add(masks(b))
diff = 0
for b in N:
    m = re.search(r'<MasterId>([^<]+)', b).group(1)
    if masks(b) not in shape.get(m, set()): diff += 1; print('SHAPE?', re.search(r'<Name>([^<]*)', b).group(1)) if diff < 10 else None
print('bad numbers', bad, 'new shapes', diff)
