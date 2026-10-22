import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Project } from '../lib/model';
import { buildScene, disposeScene } from '../lib/scene3d';

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
    const { scene, labels: tags } = buildScene(project, volumes, flows);
    for (const t of tags) {
      const div = document.createElement('div');
      div.className = 'label3d';
      div.textContent = t.text;
      const lab = new CSS2DObject(div);
      lab.position.copy(t.pos);
      scene.add(lab);
    }

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
      disposeScene(scene);
      el.innerHTML = '';
    };
  }, [project, volumes, flows]);

  return (
    <div className="canvas-pane">
      <div className="toolbar">
        <label className="check"><input type="checkbox" checked={volumes} onChange={e => setVolumes(e.target.checked)} /> Volumes (zone height, default 3 m)</label>
        <label className="check"><input type="checkbox" checked={flows} onChange={e => setFlows(e.target.checked)} /> Flows</label>
        <span className="muted small">Drag to rotate, wheel to zoom, right-drag to pan. Overview only; 3D equipment comes in a later stage.</span>
      </div>
      <div className="view3d" ref={host} />
    </div>
  );
}
