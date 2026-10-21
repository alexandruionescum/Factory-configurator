import re, html, json, sys, collections
def parse(xml):
    out=[]
    for m in re.finditer(r'i:type="PhysicalLayoutObject">(.*?)</ShowLabel>', xml, re.S):
        b=m.group(1); g=lambda k:(re.search(f'<{k}>([^<]*)</{k}>',b) or [None,None])[1]
        f=lambda k: float(g(k) or 0)
        out.append(dict(guid=g('Guid'),m=g('MasterId'),name=html.unescape(g('Name') or ''),x=f('PosX'),y=f('PosY'),z=f('PosZ'),a=f('Angle'),
            W=f('Width'),L=f('Length'),H=f('zHeight'),layer=g('Layer'),tr=g('Transparent'),hg=g('HeadOfGroup'),col=g('Color2D'),at=g('AreaType'),vt=g('VistableType')))
    return out
if __name__=='__main__':
    xml=open(sys.argv[1],encoding='utf-8-sig').read(); O=parse(xml); json.dump(O,open(sys.argv[2],'w')); print(len(O))
