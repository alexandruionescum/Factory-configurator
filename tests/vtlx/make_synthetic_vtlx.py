# Synthetic Pack and Go shaped like the toolkit expects (NOT a real visTABLE file).
import zipfile, uuid, sys
names = ['GR Goods receipt','RM Raw material store','MA Machining','WE Welding','PA Painting','AS Assembly',
         'QC Quality control','FG Finished goods store','SH Shipping','OF Production offices', 'Column & pillar']
NS = 'xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/" xmlns:d2p1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"'
objs = []
for k, n in enumerate(names):
    n = n.replace('&', '&amp;')
    objs.append(f'<d2p1:anyType z:Id="i{k+2}" i:type="PhysicalLayoutObject"><Guid>{uuid.uuid4()}</Guid><MasterId>fec0e408-0000</MasterId><Name>{n}</Name><PosX>1000</PosX><ShowLabel>true</ShowLabel></d2p1:anyType>')
layout = f'<LayoutData z:Id="i1" {NS}><Objects>{"".join(objs)}</Objects></LayoutData>'
platin = (f'<PlatinDocument z:Id="i1" {NS}><Name>doc</Name><ProductLines>'
  '<ProductLine z:Id="i2"><Document z:Ref="i1" /><Color>#FF000000</Color><Name>Old sample</Name><Operations>'
  '<Operation z:Id="i3"><Document z:Ref="i1" /><Name>A</Name><Resource z:Id="i4"><Document z:Ref="i1" /><GUID>x</GUID></Resource></Operation>'
  '<Operation z:Id="i5"><Document z:Ref="i1" /><Name>B</Name><Resource z:Id="i6"><Document z:Ref="i1" /><GUID>y</GUID></Resource></Operation>'
  '</Operations><PngBitmapByteArray>iVBORw0KGgo=</PngBitmapByteArray><Quantity>1</Quantity><Transports>'
  '<Transport z:Id="i7"><Document z:Ref="i1" /><Item z:Id="i8"><Document z:Ref="i1" /><Name>x</Name></Item><LoadCarrier z:Id="i9"><Document z:Ref="i1" /><Name>N/A</Name></LoadCarrier>'
  '<Sink z:Ref="i5" /><Source z:Ref="i3" /><TransportType z:Id="i10"><Document z:Ref="i1" /><Costs z:Id="i11"><Document z:Ref="i1" /><Value>1</Value></Costs><Name>Sonstige</Name></TransportType><productLine z:Ref="i2" /></Transport>'
  '</Transports></ProductLine></ProductLines>'
  '<TransportTypeListSerialized><TransportType z:Ref="i10" /><TransportType z:Id="i12"><Document z:Ref="i1" /><Costs z:Id="i13"><Document z:Ref="i1" /><Value>2</Value></Costs><Name>Forklift</Name></TransportType></TransportTypeListSerialized>'
  '<Settings z:Id="i14"><Default z:Ref="i12" /></Settings></PlatinDocument>')
bom = b'\xef\xbb\xbf'
with zipfile.ZipFile(sys.argv[1], 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('LayoutData.v1.xml', bom + layout.encode())
    z.writestr('platin_v1.xml', bom + platin.encode())
    z.writestr('layout.dwg', b'DWG-BYTES-UNCHANGED' * 50)
    z.writestr('MetaData.xml', bom + b'<MetaData/>')
print('ok')
