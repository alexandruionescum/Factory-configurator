"""Add a transport network (nodes KNOTEN + edges KANTE) to LayoutData.v1.xml.
polylines: list of point lists in mm [(x, y), ...]; consecutive points become edges; shared points become one node.
Usage: xml = add_network(xml, polylines); then write the zip back (keep the UTF-8 BOM, all other files unchanged)."""
import re, uuid
def add_network(xml, polylines, net_name='Universell', color='#FF797A80'):
    nid = [max(int(x) for x in re.findall(r'z:Id="i(\d+)"', xml))]
    def new_id():
        nid[0] += 1; return f"i{nid[0]}"
    nodes, edges = {}, []
    for line in polylines:
        for a, b in zip(line, line[1:]):
            for p in (a, b): nodes.setdefault(p, str(uuid.uuid4()))
            if (a, b) not in edges and (b, a) not in edges: edges.append((a, b))
    def node_xml(p, zid, tag='d2p1:anyType', typed=True):
        open_ = f'<{tag} z:Id="{zid}" i:type="NetworkObject">' if typed else f'<{tag} z:Id="{zid}">'
        return (f'{open_}<Color2D>{color}</Color2D><Guid>{nodes[p]}</Guid><HeadOfGroup>00000000-0000-0000-0000-000000000000</HeadOfGroup>'
                f'<IsLocked>false</IsLocked><Layer i:nil="true" /><VistableType>KNOTEN</VistableType><PosX>{p[0]:g}</PosX><PosY>{p[1]:g}</PosY>'
                f'<PosZ>0</PosZ><NetworkName>{net_name}</NetworkName></{tag.split(" ")[0]}>')
    out = [node_xml(p, new_id()) for p in nodes]
    for a, b in edges:
        eid = new_id(); sk = node_xml(b, new_id(), 'Sink', False); sr = node_xml(a, new_id(), 'Source', False)
        out.append(f'<d2p1:anyType z:Id="{eid}" i:type="NetworkEdge"><Color2D>{color}</Color2D><Guid>{uuid.uuid4()}</Guid>'
                   f'<HeadOfGroup>00000000-0000-0000-0000-000000000000</HeadOfGroup><IsLocked>false</IsLocked><Layer i:nil="true" />'
                   f'<VistableType>KANTE</VistableType><Direction>Both</Direction><NetworkName>{net_name}</NetworkName>{sk}{sr}</d2p1:anyType>')
    i = xml.index('</Objects>')
    xml = xml[:i] + ''.join(out) + xml[i:]
    ids = re.findall(r'z:Id="(i\d+)"', xml); assert len(ids) == len(set(ids))
    assert set(re.findall(r'z:Ref="(i\d+)"', xml)) <= set(ids)
    return xml
