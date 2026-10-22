// Test data. Synthetic only: no client data in the repository.
import { Project, Zone, emptyProject, newZone } from '../lib/model';

// 58 zones in four streams with areas from 20 to 1200 m², like a medium-size factory brief
export function bigProject(): Project {
  const p = emptyProject();
  const spec: [string, string, number[]][] = [
    ['CR', 'Cleanroom', [75, 50, 112, 126, 294, 210, 308, 140, 60, 25]],
    ['ESD', 'Electronics', [50, 110, 20, 20, 60, 40, 40, 50, 60]],
    ['H', 'Refurbishment', [160, 80, 100, 160, 70, 100, 606, 120, 90, 160, 80, 100, 280]],
    ['S', 'Shared support', [90, 55, 320, 100, 120, 120, 70, 60, 250, 618, 300, 350, 60, 653, 100, 160, 160, 80, 100, 90, 80, 90, 90, 60, 1200, 80]],
  ];
  const zones: Zone[] = [];
  for (const [pre, stream, areas] of spec)
    areas.forEach((a, i) => zones.push(newZone({
      code: `${pre}-${String(i + 1).padStart(2, '0')}`, name: `${stream} ${i + 1}`, stream, target: a,
      type: i % 3 === 0 ? 'Lager' : i % 3 === 1 ? 'Fertigung' : 'Nebenfläche',
    })));
  p.zones = zones;
  return p;
}
