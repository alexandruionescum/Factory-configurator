"""Add / remove visTABLE library objects in a Pack-and-Go (.vtlx): XML (LayoutData.v1.xml) + DWG (via libredwg JSON, written back as R2000)."""
import re, json, copy, math, uuid, zipfile, subprocess, os
DWGREAD=os.environ.get('DWGREAD','dwgread'); DWGWRITE=os.environ.get('DWGWRITE','dwgwrite')   # libredwg binaries
class Vtlx:
    def __init__(self, path, work):
        self.path=path; self.work=work; os.makedirs(work, exist_ok=True)
        z=zipfile.ZipFile(path); self.names=z.namelist()
        self.files={n:z.read(n) for n in self.names}
        self.xml=self.files['LayoutData.v1.xml'].decode('utf-8-sig')
        open(f'{work}/in.dwg','wb').write(self.files['layout.dwg'])
        subprocess.run([DWGREAD,'-O','json','-o',f'{work}/in.json',f'{work}/in.dwg'],capture_output=True,timeout=300)
        self.dwg=json.load(open(f'{work}/in.json',errors='ignore')); self.O=self.dwg['OBJECTS']
        self.hs=self.dwg['HEADER']['HANDSEED'][2]
        self.ms=[o for o in self.O if o.get('object')=='BLOCK_HEADER' and o.get('name')=='*Model_Space'][0]
        self.nid=max(int(x) for x in re.findall(r'z:Id="i(\d+)"',self.xml))+1000
        self.new_xml=[]
    def span(self, guid):
        g=self.xml.index(f'<Guid>{guid}</Guid>'); s=self.xml.rfind('<',0,self.xml.rfind(' i:type="',0,g))
        e=self.xml.index('</d2p1:anyType>', self.xml.index('</ShowLabel>',g))+len('</d2p1:anyType>'); return s,e
    def guid_of_master(self, master):
        i=self.xml.index(f'<MasterId>{master}</MasterId>'); return re.findall(r'<Guid>([^<]*)</Guid>',self.xml[:i])[-1]
    def trio(self, guid):
        k=[k for k,o in enumerate(self.O) if o.get('entity')=='ATTRIB' and o.get('text_value')==guid][0]
        return k-1,k,k+1
    def add(self, master, name, x, y, angle=0.0, posz=None, layer=None):
        tg=self.guid_of_master(master); s,e=self.span(tg); b=self.xml[s:e]
        def rid(m): self.nid+=1; return f'z:Id="i{self.nid}"'
        b=re.sub(r'z:Id="i\d+"',rid,b); g=str(uuid.uuid4())
        rep=lambda tag,val,b: re.sub(f'<{tag}>[^<]*</{tag}>',f'<{tag}>{val}</{tag}>',b,1)
        b=rep('Guid',g,b); b=rep('PosX',round(x),b); b=rep('PosY',round(y),b); b=rep('Angle',f'{angle:g}' if angle else '-0',b)
        if posz is not None: b=rep('PosZ',round(posz),b)
        if name is not None: name=name.replace('&','&amp;').replace('<','&lt;').replace('>','&gt;'); b=rep('Name',name,b)
        if layer: b=rep('Layer',layer,b)
        self.new_xml.append(b)
        ki,ka,kq=self.trio(tg); ins,att,seq=[copy.deepcopy(self.O[k]) for k in (ki,ka,kq)]
        hi,ha,hq=self.hs,self.hs+1,self.hs+2; self.hs+=3
        rot=math.radians(angle % 360)
        ins['handle']=[0,2,hi]; ins['ins_pt']=[float(x),float(y),0.0]; ins['rotation']=rot; ins['attribs']=[[3,2,ha,ha]]; ins['seqend']=[3,2,hq,hq]
        att['handle']=[0,2,ha]; att['ownerhandle']=[4,2,hi,hi]; att['ins_pt']=[float(x),float(y)]; att['text_value']=g
        if rot: att['rotation']=rot
        else: att.pop('rotation',None)
        seq['handle']=[0,2,hq]; seq['ownerhandle']=[4,2,hi,hi]
        # insert right after the last existing SEQEND (not at the very end: libredwg drops the ATTRIB link of a trailing INSERT)
        pos=max(k for k,o in enumerate(self.O) if o.get('entity')=='SEQEND')+1
        self.O[pos:pos]=[ins,att,seq]
        for n,o in enumerate(self.O): o['index']=n
        self.ms['entities'].append([3,2,hi,hi]); return g
    def remove(self, guid):
        s,e=self.span(guid); self.xml=self.xml[:s]+self.xml[e:]
        ki,ka,kq=self.trio(guid); hi=self.O[ki]['handle'][2]
        self.ms['entities']=[x for x in self.ms['entities'] if x[2]!=hi]
        for k in sorted((ki,ka,kq),reverse=True): del self.O[k]
        for n,o in enumerate(self.O): o['index']=n
    def save(self, out):
        last=max(m.end() for m in re.finditer(r'</ShowLabel>\s*</d2p1:anyType>',self.xml))
        xml=self.xml[:last]+''.join('\n    '+b for b in self.new_xml)+self.xml[last:]
        # removed objects may have held the z:Id definition of shared sub-objects (e.g. a FileAsset) that other
        # objects reference with z:Ref -> move the definition to the first remaining reference
        orig = self.files['LayoutData.v1.xml'].decode('utf-8-sig')
        for rid in sorted(set(re.findall(r'z:Ref="(i\d+)"', xml)) - set(re.findall(r'z:Id="(i\d+)"', xml))):
            m = re.search(rf'<d2p1:anyType z:Id="{rid}"[^>]*>.*?</d2p1:anyType>', orig, re.S)
            assert m, f'no definition for {rid}'
            xml = re.sub(rf'<d2p1:anyType z:Ref="{rid}"\s*/>', lambda _: m.group(0), xml, count=1)
        ids = re.findall(r'z:Id="(i\d+)"', xml)
        assert len(ids) == len(set(ids)) and not set(re.findall(r'z:Ref="(i\d+)"', xml)) - set(ids), 'z:Id / z:Ref inconsistent'
        import xml.etree.ElementTree as ET; ET.fromstring(xml.encode('utf-8-sig'))
        self.dwg['HEADER']['HANDSEED']=[0,2,self.hs,self.hs]
        # libredwg 0.13.3 corrupts INSERTs with scale_flag 1/2 when writing R2000 -> always write explicit scales
        for o in self.O:
            if o.get('entity')=='INSERT' and o.get('scale_flag',0)!=0:
                o['scale_flag']=0; o.setdefault('scale',[1.0,1.0,1.0])
        json.dump(self.dwg,open(f'{self.work}/out.json','w'))
        r=subprocess.run([DWGWRITE,'-y','--as','r2000','-I','JSON','-o',f'{self.work}/out.dwg',f'{self.work}/out.json'],capture_output=True,text=True,timeout=300)
        assert 'SUCCESS' in (r.stdout+r.stderr), r.stderr[-500:]
        subprocess.run([DWGREAD,'-O','json','-o',f'{self.work}/chk.json',f'{self.work}/out.dwg'],capture_output=True,timeout=300)
        C=json.load(open(f'{self.work}/chk.json',errors='ignore'))['OBJECTS']
        bad=[o['handle'] for o in C if o.get('entity')=='INSERT' and (o.get('first_attrib') or [0,0,0,0])[-1]==0]
        assert not bad, f'INSERT without ATTRIB after write: {bad}'
        # rotation / scale sanity after the R2000 round-trip
        import math as _m
        want={}
        for m_ in re.finditer(r'<Guid>([^<]+)</Guid>.*?<Angle>([^<]+)</Angle>',xml,re.S): want[m_.group(1)]=float(m_.group(2))
        badrot=[]; badsc=[]
        for k_,o_ in enumerate(C):
            if o_.get('entity')=='ATTRIB' and o_.get('text_value') in want:
                ins_=C[k_-1]; r_=ins_.get('rotation',0.0); a_=_m.radians(want[o_['text_value']]%360)
                d_=abs((r_-a_+_m.pi)%(2*_m.pi)-_m.pi)
                if not _m.isfinite(r_) or d_>0.01: badrot.append((o_['text_value'],r_,a_))
                sc_=ins_.get('scale',[1,1,1])
                if any((not _m.isfinite(v_)) or abs(v_)>1e7 or v_==0 for v_ in sc_[:2]): badsc.append((o_['text_value'],sc_))
        self.check={'badrot':badrot,'badscale':badsc}
        assert not badrot and not badsc, f'aberrant DWG after write: rot {badrot[:5]} scale {badsc[:5]}'
        zin=zipfile.ZipFile(self.path); zout=zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED)
        for it in zin.infolist():
            data=self.files[it.filename]
            if it.filename=='LayoutData.v1.xml': data=xml.encode('utf-8-sig')
            if it.filename=='layout.dwg': data=open(f'{self.work}/out.dwg','rb').read()
            zout.writestr(it,data)
        zout.close()
