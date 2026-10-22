import { describe, expect, it } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { exampleProject } from '../lib/model';
import { arranged } from '../lib/layout';
import { checkDataContract, matchZones, readVtlx, writeFlows } from '../lib/vtlx';
import { buildPptx } from '../lib/pptx';

const BOM = [0xef, 0xbb, 0xbf];
const NS = 'xmlns:i="http://www.w3.org/2001/XMLSchema-instance" xmlns:z="http://schemas.microsoft.com/2003/10/Serialization/" xmlns:d2p1="http://schemas.microsoft.com/2003/10/Serialization/Arrays"';
// jsdom's Blob has no arrayBuffer(); FileReader works in jsdom and browsers
const bytes = (b: Blob) => new Promise<Uint8Array>((res, rej) => {
  const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result as ArrayBuffer)); r.onerror = rej; r.readAsArrayBuffer(b);
});
const withBom = (s: string) => new Uint8Array([...BOM, ...strToU8(s)]);

// Synthetic Pack and Go shaped like the visTABLE toolkit describes (not a real visTABLE file).
function syntheticVtlx(blockNames: string[]): ArrayBuffer {
  const objs = blockNames.map((n, k) => `<d2p1:anyType z:Id="i${k + 2}" i:type="PhysicalLayoutObject"><Guid>g-${k}</Guid><Name>${n.replace(/&/g, '&amp;')}</Name><ShowLabel>true</ShowLabel></d2p1:anyType>`);
  const layout = `<LayoutData z:Id="i1" ${NS}><Objects>${objs.join('')}</Objects></LayoutData>`;
  const platin = `<PlatinDocument z:Id="i1" ${NS}><ProductLines><ProductLine z:Id="i2"><Document z:Ref="i1" /><Name>Old sample</Name><Operations>`
    + '<Operation z:Id="i3"><Document z:Ref="i1" /><Resource z:Id="i4"><Document z:Ref="i1" /><GUID>x</GUID></Resource></Operation>'
    + '<Operation z:Id="i5"><Document z:Ref="i1" /><Resource z:Id="i6"><Document z:Ref="i1" /><GUID>y</GUID></Resource></Operation>'
    + '</Operations><PngBitmapByteArray>iVBORw0KGgo=</PngBitmapByteArray><Transports><Transport z:Id="i7"><Document z:Ref="i1" />'
    + '<Sink z:Ref="i5" /><Source z:Ref="i3" /><TransportType z:Id="i10"><Document z:Ref="i1" /><Costs z:Id="i11"><Value>1</Value></Costs><Name>Default</Name></TransportType>'
    + '<productLine z:Ref="i2" /></Transport></Transports></ProductLine></ProductLines>'
    + '<TransportTypeListSerialized><TransportType z:Ref="i10" /><TransportType z:Id="i12"><Costs z:Id="i13"><Value>2</Value></Costs><Name>Forklift</Name></TransportType></TransportTypeListSerialized>'
    + '<Settings z:Id="i14"><Default z:Ref="i12" /></Settings></PlatinDocument>';
  const zip = zipSync({ 'LayoutData.v1.xml': withBom(layout), 'platin_v1.xml': withBom(platin), 'layout.dwg': strToU8('DWG'.repeat(100)) });
  return zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;
}

describe('material flows into a Pack and Go', () => {
  const p = exampleProject();
  const names = p.zones.map(z => `${z.code} ${z.name}`);

  it('links zones to blocks and writes a valid platin_v1.xml', async () => {
    const src = syntheticVtlx(names);
    const f = readVtlx('test.vtlx', src);
    expect(f.template).toBe(true);
    expect(f.productLines).toEqual(['Old sample']);
    expect(matchZones(p, f).every(m => m.block)).toBe(true);
    const r = writeFlows(p, f);
    expect(r.productLines).toBe(2);
    expect(r.transports).toBe(14);
    const out = unzipSync(await bytes(r.blob));
    const before = unzipSync(new Uint8Array(src));
    expect(out['layout.dwg']).toEqual(before['layout.dwg']);
    expect(out['LayoutData.v1.xml']).toEqual(before['LayoutData.v1.xml']);
    expect([...out['platin_v1.xml'].slice(0, 3)]).toEqual(BOM);
    const xml = new TextDecoder().decode(out['platin_v1.xml']);
    expect(checkDataContract(xml)).toBeNull();
    expect(xml).not.toContain('Old sample');
    expect(xml).toContain('<Default z:Ref="');                     // later references renumbered, still valid
  });

  it('refuses a file without a sample flow or with duplicate block names', () => {
    const dup = readVtlx('dup.vtlx', syntheticVtlx([...names, names[2]]));
    expect(matchZones(p, dup).find(m => m.zone.code === 'MA')!.candidates).toBe(2);
    expect(() => writeFlows(p, dup)).toThrow(/No unique block/);
    expect(() => readVtlx('x.vtlx', new TextEncoder().encode('hello').buffer as ArrayBuffer)).toThrow(/not a Pack and Go/);
  });
});

describe('PowerPoint', () => {
  it('builds a deck for an arranged project', async () => {
    const { project } = arranged(exampleProject());
    const blob = await buildPptx(project, {
      footer: 'Test', planAspect: 1.2,
      planPng: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    });
    const files = unzipSync(await bytes(blob));
    const slides = Object.keys(files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k));
    expect(slides.length).toBe(6); // title, layout, overview, zone list, flows, checks
    expect(new TextDecoder().decode(files['ppt/slides/slide1.xml'])).toContain('Example (fictitious data)');
  });
});
