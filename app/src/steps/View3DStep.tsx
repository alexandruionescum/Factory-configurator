import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Project, zoneCenter } from '../lib/model';
import { pairFlows } from '../lib/flows';

// 3D overview: plan (x, y) maps to three.js (x, 0, -y), so north points away from the default camera.
function buildScene(p: Project, volumes: boolean, flows: boolean) {
  const scene = new THREE.Scene();
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
    const h = volumes ? Math.min(3, H) : 0.08;
    const mat = new THREE.MeshLambertMaterial({ color: z.color, transparent: volumes, opacity: volumes ? 0.45 : 1 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(z.w, h, z.l), mat);
    const c = zoneCenter(z);
    box.position.set(c.x, h / 2, -c.y);
    scene.add(box);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0x3b3d43 }));
    edges.position.copy(box.position);
    scene.add(edges);
    const el = document.createElement('div');
    el.className = 'label3d';
    el.textContent = z.code || z.name;
    const lab = new CSS2DObject(el);
    lab.position.set(c.x, h + 0.4, -c.y);
    scene.add(lab);
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
  return scene;
}

export default function View3DStep({ project }: { project: Project }) {
  const host = useRef<HTMLDivElement>(null);
  const [volumes, setVolumes] = useState(false);
  const [flows, setFlows] = useState(true);

  useEffect(() => {
    const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xeff1f6);
    el.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.className = 'labels3d';
    el.appendChild(labels.domElement);

    const { width: W, length: L } = project.hall;
    const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);
    camera.position.set(W * 0.5 + W * 0.15, Math.max(W, L) * 0.75, L * 0.55);
    const controls = new OrbitControls(camera, labels.domElement);
    controls.target.set(W / 2, 0, -L / 2);
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.update();
    const scene = buildScene(project, volumes, flows);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); labels.setSize(w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize); ro.observe(el); resize();
    let raf = 0;
    const loop = () => { controls.update(); renderer.render(scene, camera); labels.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); renderer.dispose();
      scene.traverse(o => { if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
      el.innerHTML = '';
    };
  }, [project, volumes, flows]);

  return (
    <div className="canvas-pane">
      <div className="toolbar">
        <label className="check"><input type="checkbox" checked={volumes} onChange={e => setVolumes(e.target.checked)} /> Volumes (3 m)</label>
        <label className="check"><input type="checkbox" checked={flows} onChange={e => setFlows(e.target.checked)} /> Flows</label>
        <span className="muted small">Drag to rotate, wheel to zoom, right-drag to pan. Overview only; 3D equipment comes in a later stage.</span>
      </div>
      <div className="view3d" ref={host} />
    </div>
  );
}
