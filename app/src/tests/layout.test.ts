import { describe, expect, it } from 'vitest';
import { GroupBy, Project, ShapeType, exampleProject, zoneArea } from '../lib/model';
import { arranged, buildingArea, insideArea, layoutIssues, overlap, proposeForShape, proposeHall } from '../lib/layout';
import { bigProject } from './fixtures';

const SHAPES: ShapeType[] = ['I', 'L', 'U', 'S'];
const ROTS = [0, 90, 180, 270] as const;

function check(p: Project) {
  const zs = p.zones.filter(z => z.placed);
  let ov = 0;
  for (let i = 0; i < zs.length; i++) for (let j = i + 1; j < zs.length; j++) ov += overlap(zs[i], zs[j]);
  const outside = zs.filter(z => insideArea(p, z) < zoneArea(z) - 0.05).length;
  const dev = Math.max(...zs.map(z => Math.abs(zoneArea(z) - z.target) / z.target));
  return { placed: zs.length, ov, outside, dev };
}

describe('automatic arrangement', () => {
  for (const [name, make] of [['example', exampleProject], ['58 zones', bigProject]] as const)
    for (const shape of SHAPES) for (const rot of ROTS) for (const groupBy of ['stream', 'type', 'flow'] as GroupBy[])
      it(`${name}: ${shape} ${rot}° by ${groupBy}, size fitted to the shape`, () => {
        const p0 = make();
        const p = { ...p0, layout: { shape, rot, wing: null, groupBy, separate: groupBy !== 'flow' } };
        const size = proposeForShape(p);
        const { project, result } = arranged({ ...p, hall: { ...p.hall, ...size } });
        const c = check(project);
        expect(result.fits).toBe(true);
        expect(c.placed).toBe(p0.zones.length);
        expect(c.ov).toBeLessThan(0.01);
        expect(c.outside).toBe(0);
        expect(c.dev).toBeLessThan(0.03);
        expect(layoutIssues(project).filter(i => i.level === 'error')).toEqual([]);
      });

  it('aisles keep zones apart and still fit after Fit size', () => {
    const p0 = bigProject();
    const p = { ...p0, aisle: 3, layout: { shape: 'U' as const, rot: 0 as const, wing: null, groupBy: 'stream' as const, separate: false } };
    const { project, result } = arranged({ ...p, hall: { ...p.hall, ...proposeForShape(p) } });
    expect(result.fits).toBe(true);
    expect(check(project).ov).toBeLessThan(0.01);
  });

  it('reports zones that do not fit instead of overlapping them', () => {
    const p = { ...bigProject(), hall: { width: 40, length: 40, height: 8 } };
    const { project, result } = arranged(p);
    expect(result.fits).toBe(false);
    expect(check(project).ov).toBeLessThan(0.01);
    expect(layoutIssues(project).some(i => i.text.includes('outside the factory'))).toBe(true);
  });

  it('proposes a rectangular hall that holds the zones', () => {
    const p = bigProject();
    const h = proposeHall(p, 1.12);
    const total = p.zones.reduce((s, z) => s + z.target, 0);
    expect(h.width * h.length).toBeGreaterThanOrEqual(total * 1.12);
    expect(arranged({ ...p, hall: { ...p.hall, ...h } }).result.fits).toBe(true);
  });

  it('measures the building, not the outer box, for L / U / S', () => {
    const p = { ...bigProject(), layout: { shape: 'L' as const, rot: 0 as const, wing: null, groupBy: 'stream' as const, separate: false } };
    const { project } = arranged({ ...p, hall: { ...p.hall, ...proposeForShape(p) } });
    expect(buildingArea(project)).toBeLessThan(project.hall.width * project.hall.length);
  });
});
