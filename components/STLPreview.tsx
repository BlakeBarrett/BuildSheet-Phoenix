import React, { useRef, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as THREE from 'three';
import { IconButton } from './Material3UI.tsx';

interface STLPreviewProps {
  openSCADCode: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * STL Preview component using Three.js.
 * Since we can't compile OpenSCAD to STL in the browser without a WASM build,
 * this renders a parametric approximation based on the OpenSCAD code by
 * extracting dimension/shape primitives and rendering them as Three.js geometry.
 */
export const STLPreview: React.FC<STLPreviewProps> = ({ openSCADCode, isOpen, onClose }) => {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(80, 60, 80);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 100, 50);
    scene.add(directionalLight);
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-50, 50, -50);
    scene.add(backLight);

    // Grid helper
    const gridHelper = new THREE.GridHelper(100, 20, 0xcbd5e1, 0xe2e8f0);
    scene.add(gridHelper);

    // Parse OpenSCAD and create geometry
    const geometries = parseOpenSCAD(openSCADCode);
    if (geometries.length === 0) {
      setError('Could not extract geometry from OpenSCAD code. Showing placeholder.');
      // Add a default box as placeholder
      const geo = new THREE.BoxGeometry(30, 20, 40);
      const mat = new THREE.MeshPhongMaterial({ color: 0x6366f1, transparent: true, opacity: 0.85 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 10;
      scene.add(mesh);
      // Add wireframe
      const wireGeo = new THREE.EdgesGeometry(geo);
      const wireMat = new THREE.LineBasicMaterial({ color: 0x4338ca });
      const wire = new THREE.LineSegments(wireGeo, wireMat);
      wire.position.y = 10;
      scene.add(wire);
    } else {
      setError(null);
      geometries.forEach(g => scene.add(g));
    }

    // Mouse orbit controls (simple implementation)
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let theta = Math.PI / 4;
    let phi = Math.PI / 6;
    let radius = 120;

    const updateCamera = () => {
      camera.position.x = radius * Math.cos(phi) * Math.cos(theta);
      camera.position.y = radius * Math.sin(phi);
      camera.position.z = radius * Math.cos(phi) * Math.sin(theta);
      camera.lookAt(0, 0, 0);
    };

    updateCamera();

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      theta -= deltaX * 0.005;
      phi = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, phi + deltaY * 0.005));
      previousMousePosition = { x: e.clientX, y: e.clientY };
      updateCamera();
    };

    const onPointerUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      radius = Math.max(30, Math.min(300, radius + e.deltaY * 0.1));
      updateCamera();
    };

    const el = renderer.domElement;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);
    el.addEventListener('pointerleave', onPointerUp);
    el.addEventListener('wheel', onWheel, { passive: false });

    // Animation loop
    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameRef.current);
      resizeObserver.disconnect();
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUp);
      el.removeEventListener('pointerleave', onPointerUp);
      el.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isOpen, openSCADCode]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[170] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="stl-title" onClick={onClose}>
      <div className="bg-white rounded-[32px] shadow-2xl max-w-3xl w-full h-[70vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 flex justify-between items-center border-b border-gray-100">
          <div>
            <h3 id="stl-title" className="text-lg font-bold text-slate-800 tracking-tight flex items-center gap-2">
              <span className="material-symbols-rounded text-indigo-600" aria-hidden="true">view_in_ar</span>
              3D Preview
            </h3>
            {error && <p className="text-xs text-amber-600 mt-0.5">{error}</p>}
          </div>
          <IconButton icon="close" onClick={onClose} title={t('modal.close')} />
        </div>
        <div ref={containerRef} className="flex-1 relative" />
        <div className="px-6 py-3 border-t border-gray-100 bg-slate-50 text-xs text-slate-500 flex justify-between items-center">
          <span>{t('stl.dragHint')}</span>
          <span className="font-mono text-slate-400">{t('stl.converter')}</span>
        </div>
      </div>
    </div>
  );
};

/**
 * Simple OpenSCAD parser — extracts cube() and cylinder() calls and their dimensions.
 * This isn't a full OpenSCAD compiler but covers the common parametric enclosure output.
 */
function parseOpenSCAD(code: string): THREE.Object3D[] {
  const objects: THREE.Object3D[] = [];
  const material = new THREE.MeshPhongMaterial({ color: 0x6366f1, transparent: true, opacity: 0.8 });
  const wireMaterial = new THREE.LineBasicMaterial({ color: 0x4338ca });

  let yOffset = 0;

  // Match cube([x, y, z])
  const cubeRegex = /cube\(\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/g;
  let match;
  while ((match = cubeRegex.exec(code)) !== null) {
    const w = parseFloat(match[1]);
    const h = parseFloat(match[2]);
    const d = parseFloat(match[3]);
    const geo = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(geo, material.clone());
    mesh.position.y = yOffset + h / 2;
    objects.push(mesh);

    const wireGeo = new THREE.EdgesGeometry(geo);
    const wire = new THREE.LineSegments(wireGeo, wireMaterial);
    wire.position.y = yOffset + h / 2;
    objects.push(wire);

    yOffset += h + 2;
  }

  // Match cylinder(h=X, r=Y) or cylinder(h=X, d=Y) or cylinder(r=X, h=Y)
  const cylRegex = /cylinder\(\s*(?:h\s*=\s*([\d.]+)\s*,\s*(?:r|r1)\s*=\s*([\d.]+)|(?:r|r1)\s*=\s*([\d.]+)\s*,\s*h\s*=\s*([\d.]+)|h\s*=\s*([\d.]+)\s*,\s*d\s*=\s*([\d.]+))/g;
  while ((match = cylRegex.exec(code)) !== null) {
    const h = parseFloat(match[1] || match[4] || match[5]) || 10;
    let r = parseFloat(match[2] || match[3]) || 0;
    if (!r && match[6]) r = parseFloat(match[6]) / 2;
    if (!r) r = 5;

    const geo = new THREE.CylinderGeometry(r, r, h, 32);
    const mesh = new THREE.Mesh(geo, material.clone());
    mesh.position.y = yOffset + h / 2;
    objects.push(mesh);

    const wireGeo = new THREE.EdgesGeometry(geo);
    const wire = new THREE.LineSegments(wireGeo, wireMaterial);
    wire.position.y = yOffset + h / 2;
    objects.push(wire);

    yOffset += h + 2;
  }

  // Match sphere(r=X) or sphere(d=X) 
  const sphereRegex = /sphere\(\s*(?:r\s*=\s*([\d.]+)|d\s*=\s*([\d.]+)|([\d.]+))\s*\)/g;
  while ((match = sphereRegex.exec(code)) !== null) {
    let r = parseFloat(match[1] || match[3]) || 0;
    if (!r && match[2]) r = parseFloat(match[2]) / 2;
    if (!r) r = 5;

    const geo = new THREE.SphereGeometry(r, 32, 32);
    const mesh = new THREE.Mesh(geo, material.clone());
    mesh.position.y = yOffset + r;
    objects.push(mesh);

    yOffset += r * 2 + 2;
  }

  return objects;
}
