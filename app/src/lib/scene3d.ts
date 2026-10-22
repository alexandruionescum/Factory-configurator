// 3D scene of the layout, shared by the 3D step (interactive) and the PowerPoint export (still images).
// Plan (x, y) maps to three.js (x, 0, -y), so north points away from the default camera.
import * as THREE from 'three';
import { Project, zoneCenter } from './model';
import { pairFlows } from './flows';

export interface Label3D { pos: THREE.Vector3; text: string }

export function buildScene(p: Project, volumes: boolean, flows: boolean): { scene: THREE.Scene; labels: Label3D[] } {
  const scene = new THREE.Scene();
  const labels: Label3D[] = [];
  const { width: W, length: L, height: H } = p.hall;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8e98, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(W * 0.3, H * 4, L * 0.8);
  scene.add(sun);

  // building outline: one floor slab and wall frame per rectangle of the footprint (L / U / S shapes)
  const parts = p.hall.footprint?.length ? p.hall.footprint : [{ x: 0, y: 0, w: W, l: L }];
  const pts: number[] = [];
  for (const r of parts) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.1, r.l), new THREE.MeshLambertMaterial({ color: 0xd4d7dd }));
    floor.position.set(r.x + r.w / 2, -0.05, -(r.y + r.l / 2));
    scene.add(floor);
    const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(r.w, H, r.l)), new THREE.LineBasicMaterial({ color: 0x6a6e79 }));
    shell.position.set(r.x + r.w / 2, H / 2, -(r.y + r.l / 2));
    scene.add(shell);
    // 5 m grid, clipped to the part
    for (let x = Math.ceil(r.x / 5) * 5; x <= r.x + r.w + 1e-6; x += 5) pts.push(x, 0.01, -r.y, x, 0.01, -(r.y + r.l));
    for (let y = Math.ceil(r.y / 5) * 5; y <= r.y + r.l + 1e-6; y += 5) pts.push(r.x, 0.01, -y, r.x + r.w, 0.01, -y);
  }
  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(gridGeo, new THREE.LineBasicMaterial({ color: 0xa9acb4 })));

  for (const z of p.zones.filter(q => q.placed)) {
    const h = volumes ? Math.min(z.height ?? 3, H) : 0.08;
    const mat = new THREE.MeshLambertMaterial({ color: z.color, transparent: volumes, opacity: volumes ? 0.45 : 1 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(z.w, h, z.l), mat);
    const c = zoneCenter(z);
    box.position.set(c.x, h / 2, -c.y);
    scene.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0x3b3d43 }));
    edges.position.copy(box.position);
    scene.add(edges);
    labels.push({ pos: new THREE.Vector3(c.x, h + 0.4, -c.y), text: z.code || z.name });
  }

  if (flows) {
    const pf = pairFlows(p).filter(f => f.from.placed && f.to.placed);
    const max = Math.max(1, ...pf.map(f => f.trips));
    for (const f of pf) {
      const a = zoneCenter(f.from), b = zoneCenter(f.to);
      const len = Math.hypot(a.x - b.x, a.y - b.y);
      const lift = (volumes ? Math.min(3, H) : 0) + 0.5;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(a.x, lift, -a.y),
        new THREE.Vector3((a.x + b.x) / 2, lift + Math.max(1.5, len * 0.25), -(a.y + b.y) / 2),
        new THREE.Vector3(b.x, lift, -b.y),
      );
      const color = f.products.length === 1 ? f.products[0].color : '#3B3D43';
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.08 + 0.35 * (f.trips / max), 8), new THREE.MeshLambertMaterial({ color }));
      scene.add(tube);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.25 + 0.5 * (f.trips / max), 1, 12), new THREE.MeshLambertMaterial({ color }));
      const end = curve.getPoint(1), dir = curve.getTangent(0.98).normalize();
      tip.position.copy(end);
      tip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(tip);
    }
  }
  return { scene, labels };
}

export function disposeScene(scene: THREE.Scene) {
  scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
}

export interface View3D { title: string; dir: [number, number, number]; volumes: boolean; flows: boolean }

// Two still views for the presentation: flat zones with flows from the south-east,
// zone volumes from the north-west.
export const EXPORT_VIEWS: View3D[] = [
  { title: 'Zones and material flows, seen from the south-east', dir: [0.55, 0.95, 1], volumes: false, flows: true },
  { title: 'Zone volumes, seen from the north-west', dir: [-0.55, 0.8, -1], volumes: true, flows: false },
];

// Renders one view to a PNG data URL, labels drawn onto the image. Throws when WebGL is not available.
export function render3D(p: Project, v: View3D, width = 1600, height = 1000): string {
  const { scene, labels } = buildScene(p, v.volumes, v.flows);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.setClearColor(0xffffff);
    const { width: W, length: L, height: H } = p.hall;
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.5, 5000);
    const target = new THREE.Vector3(W / 2, H * 0.15, -L / 2);
    // closest camera distance at which every corner of the building stays inside the image (5 % margin)
    const corners = [0, W].flatMap(x => [0, L].flatMap(y => [0, H].map(z => new THREE.Vector3(x, z, -y))));
    const dir = new THREE.Vector3(...v.dir).normalize();
    const place = (d: number) => {
      camera.position.copy(target).addScaledVector(dir, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      return corners.every(c => { const q = c.clone().project(camera); return Math.abs(q.x) <= 0.95 && Math.abs(q.y) <= 0.95; });
    };
    let lo = 1, hi = 4 * Math.hypot(W, L, H);
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (place(mid)) hi = mid; else lo = mid; }
    place(hi);
    renderer.render(scene, camera);

    const cv = document.createElement('canvas');
    cv.width = width; cv.height = height;
    const g = cv.getContext('2d')!;
    g.drawImage(renderer.domElement, 0, 0);
    const s = width / 800;
    g.font = `700 ${Math.round(11 * s)}px Roboto, Arial, sans-serif`;
    g.textBaseline = 'middle';
    for (const l of labels) {
      const q = l.pos.clone().project(camera);
      if (q.z > 1) continue;
      const x = (q.x + 1) / 2 * width, y = (1 - q.y) / 2 * height;
      const tw = g.measureText(l.text).width, bh = 16 * s, pad = 6 * s;
      g.fillStyle = '#FFFFFF'; g.fillRect(x - tw / 2 - pad, y - bh / 2, tw + 2 * pad, bh);
      g.fillStyle = '#EE6B00'; g.fillRect(x - tw / 2 - pad, y - bh / 2, 3 * s, bh);
      g.fillStyle = '#000000'; g.fillText(l.text, x - tw / 2 + 1.5 * s, y);
    }
    return cv.toDataURL('image/png');
  } finally {
    renderer.dispose();
    renderer.forceContextLoss();
    disposeScene(scene);
  }
}
