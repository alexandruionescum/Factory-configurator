import re, uuid, math, zipfile
from xml.sax.saxutils import escape
from lxml import etree
import sys
SRC, DST = sys.argv[1], sys.argv[2]   # input Pack and Go, output .vtlx
# Adds product lines, operations and transports to platin_v1.xml. Needs one existing sample transport in the file (its TransportType z:Id is read below - check the id).
z=zipfile.ZipFile(SRC)
lay=z.read('LayoutData.v1.xml').decode('utf-8-sig')
pl_raw=z.read('platin_v1.xml'); bom=pl_raw.startswith(b'\xef\xbb\xbf'); pl=pl_raw.decode('utf-8-sig')
# name -> guid of real blocks
G={}
for m in re.finditer(r'i:type="PhysicalLayoutObject">(.*?)</d2p1:anyType>\s*(?=<d2p1:anyType z:Id|</Objects>)',lay,re.S):
    b=m.group(1); G[re.search('<Name>(.*?)</Name>',b).group(1).split(' ')[0]]=re.search('<Guid>(.*?)</Guid>',b).group(1)
png=re.search(r'<PngBitmapByteArray>(.*?)</PngBitmapByteArray>',pl,re.S).group(1)
ttlist=re.search(r'<TransportTypeListSerialized>(.*?)</TransportTypeListSerialized>',pl,re.S).group(1)
# the 'Sonstige' definition used by the sample transport (inline, z:Id="i11") with its Costs block
son=re.search(r'<TransportType z:Id="i11">.*?</TransportType>',pl,re.S).group(0)

# ---- PROJECT DATA (placeholders): product families (name, annual volume, colour) and routes (source block ID, sink block ID, items per transport)
PF=[("Family A",1000,"#FF2F5F9E"),("Family B",4000,"#FFD08A00")]
ROUTES={"Family A":[("REC-01","WH-01",20),("WH-01","ASM-01",4),("ASM-01","TST-01",4),("TST-01","FG-01",20)],
        "Family B":[("REC-01","WH-01",100),("WH-01","ASM-02",16),("ASM-02","FG-01",50)]}
# block IDs = first word of the block Name in LayoutData (e.g. "ASM-01 Assembly")
nid=[2]
def new():
    nid[0]+=1; return f"i{nid[0]}"
out=[]; son_id=None; lc_id=None
for fam,qty,col in PF:
    routes=ROUTES[fam]
    plid=new()
    nodes=[]
    for a,b,_ in routes:
        for n in (a,b):
            if n not in nodes: nodes.append(n)
    ops={}; opx=[]
    for n in nodes:
        oid=new(); rid=new(); ops[n]=oid
        opx.append(f'''<Operation z:Id="{oid}"><Document z:Ref="i1" /><Annotation i:nil="true" /><BZ>0</BZ><CT>0</CT><Color i:nil="true" /><Inventory i:nil="true" /><ManualPosition xmlns:d7p1="http://schemas.plavis.de/vistable/typeLibrary" i:nil="true" /><Name>{escape(n)}</Name><Resource z:Id="{rid}"><Document z:Ref="i1" /><GUID>{G[n]}</GUID></Resource><StoredItem i:nil="true" /><TimeField1></TimeField1><TimeFieldSetup1></TimeFieldSetup1><UseForLeadTimeCalculation>false</UseForLeadTimeCalculation><id>{uuid.uuid4()}</id></Operation>''')
    trx=[]; item_id=None
    for a,b,ppc in routes:
        tid=new(); q=math.ceil(qty/ppc)
        if item_id is None:
            item_id=new(); item=f'<Item z:Id="{item_id}"><Document z:Ref="i1" /><Name>{escape(fam)}</Name></Item>'
        else: item=f'<Item z:Ref="{item_id}" />'
        if lc_id is None:
            lc_id=new(); lc=f'<LoadCarrier z:Id="{lc_id}"><Document z:Ref="i1" /><Name>N/A</Name></LoadCarrier>'
        else: lc=f'<LoadCarrier z:Ref="{lc_id}" />'
        if son_id is None:
            son_id=new(); cid=new()
            tt=re.sub(r'<TransportType z:Id="i11">',f'<TransportType z:Id="{son_id}">',son,1)
            tt=re.sub(r'<Costs z:Id="i\d+">',f'<Costs z:Id="{cid}">',tt,1)
        else: tt=f'<TransportType z:Ref="{son_id}" />'
        trx.append(f'<Transport z:Id="{tid}"><Document z:Ref="i1" /><ContainersPerTransport>1</ContainersPerTransport><Inventory>0</Inventory><IsCalculated>true</IsCalculated>{item}<ItemsPerContainer>{ppc}</ItemsPerContainer>{lc}<QtyPerProduct>1</QtyPerProduct><Quantity>{q}</Quantity><Sink z:Ref="{ops[b]}" /><Source z:Ref="{ops[a]}" />{tt}<productLine z:Ref="{plid}" /><transportQtyDivProductLineQty>0</transportQtyDivProductLineQty></Transport>')
    out.append(f'<ProductLine z:Id="{plid}"><Document z:Ref="i1" /><Color>{col}</Color><IntensityBaseUnit>Transport</IntensityBaseUnit><LastChange>2026-09-25T12:00:00</LastChange><LeadTimeCalculationMethod>CycletimeOfSuccessor</LeadTimeCalculationMethod><LeadTimeMode>false</LeadTimeMode><Name>{escape(fam)}</Name><Operations>{"".join(opx)}</Operations><PngBitmapByteArray>{png}</PngBitmapByteArray><Quantity>{qty}</Quantity><QuantityNotSpecified>false</QuantityNotSpecified><TaktTime i:nil="true" /><Transports>{"".join(trx)}</Transports><_manualPlacement>false</_manualPlacement></ProductLine>')
# renumber transport type list: replace Ref i11 with son_id, all other z:Id in list -> new ids
def ren(m): return f'z:Id="{new()}"'
tl=ttlist.replace('z:Ref="i11"',f'z:Ref="{son_id}"')
tl=re.sub(r'z:Id="i\d+"',ren,tl)
new_pl=re.sub(r'<ProductLines>.*?</ProductLines>','<ProductLines>'+''.join(out)+'</ProductLines>',pl,count=1,flags=re.S)
new_pl=re.sub(r'<TransportTypeListSerialized>.*?</TransportTypeListSerialized>',lambda m:'<TransportTypeListSerialized>'+tl+'</TransportTypeListSerialized>',new_pl,count=1,flags=re.S)
etree.fromstring(new_pl.encode())
ids=re.findall(r'z:Id="(i\d+)"',new_pl); refs=set(re.findall(r'z:Ref="(i\d+)"',new_pl))
assert len(ids)==len(set(ids)) and refs<=set(ids), (len(ids),len(set(ids)),refs-set(ids))
# refs must point to earlier ids
pos={i:new_pl.find(f'z:Id="{i}"') for i in ids}
bad=[r for r in refs if any(new_pl.find(f'z:Ref="{r}"')<pos[r] for _ in [0])]
print('ids',len(ids),'forward refs',bad)
data=(b'\xef\xbb\xbf' if bom else b'')+new_pl.encode('utf-8')
zo=zipfile.ZipFile(DST,'w',zipfile.ZIP_DEFLATED)
for it in z.infolist():
    d=z.read(it.filename)
    if it.filename=='platin_v1.xml': d=data
    zi=zipfile.ZipInfo(it.filename,date_time=it.date_time); zi.compress_type=zipfile.ZIP_DEFLATED; zi.external_attr=it.external_attr
    zo.writestr(zi,d)
zo.close()
print(sum(len(ROUTES[f]) for f,_,_ in PF),'transports')
