
import React, { useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Text, PerspectiveCamera, Center, Float } from '@react-three/drei';
import * as THREE from 'three';
import { VisualManifest, VisualComponent } from '../types';
// Add missing import for Chip
import { Chip } from './Material3UI';

// Fix for JSX intrinsic element errors (group, mesh, primitive, etc.) 
// Since the intrinsic elements for @react-three/fiber are not being recognized 
// in the current environment's JSX namespace, we use capitalized constants 
// as component aliases to bypass the IntrinsicElements check.
const Group = 'group' as any;
const Mesh = 'mesh' as any;
const Primitive = 'primitive' as any;
const MeshStandardMaterial = 'meshStandardMaterial' as any;
const AmbientLight = 'ambientLight' as any;
const PointLight = 'pointLight' as any;
const SpotLight = 'spotLight' as any;

const ComponentPrimitive: React.FC<{ 
  component: VisualComponent, 
  index: number, 
  explode: number,
  axis: 'x' | 'y' | 'z'
}> = ({ component, index, explode, axis }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHover] = useState(false);

  // Procedural geometry based on component shape
  const geometry = useMemo(() => {
    switch (component.shape) {
      case 'cylinder':
        return new THREE.CylinderGeometry(component.dims[0] / 10, component.dims[0] / 10, component.dims[1] / 10, 32);
      case 'sphere':
        return new THREE.SphereGeometry(component.dims[0] / 10, 32, 32);
      case 'box':
      default:
        return new THREE.BoxGeometry(component.dims[0] / 10, component.dims[1] / 10, component.dims[2] / 10);
    }
  }, [component]);

  // Explode Offset Logic
  const position = useMemo(() => {
    const offset = index * (1.5 * explode); // Scale explode factor
    const pos: [number, number, number] = [0, 0, 0];
    const axisIdx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    pos[axisIdx] = offset;
    return pos;
  }, [index, explode, axis]);

  return (
    <Group position={position}>
      <Mesh 
        ref={meshRef}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <Primitive object={geometry} attach="geometry" />
        <MeshStandardMaterial 
          color={hovered ? '#6366f1' : component.color} 
          transparent 
          opacity={0.85} 
          roughness={0.2} 
          metalness={0.5} 
        />
      </Mesh>
      <Text
        position={[0, (component.dims[1] / 20) + 0.2, 0]}
        fontSize={0.15}
        color="#1e293b"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.01}
        outlineColor="#ffffff"
      >
        {component.label}
      </Text>
    </Group>
  );
};

export const ChiltonVisualizer: React.FC<{ manifest?: VisualManifest }> = ({ manifest }) => {
  const [explode, setExplode] = useState(0.5);

  if (!manifest || !manifest.components.length) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100/50 rounded-2xl border-2 border-dashed border-gray-200">
        <div className="text-center text-gray-400">
           <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
           <p className="text-[10px] font-bold uppercase tracking-widest">3D Stage Awaiting Data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-[#f8fafc] rounded-2xl overflow-hidden border border-gray-200 shadow-inner group">
      <Canvas shadows dpr={[1, 2]}>
        <PerspectiveCamera makeDefault position={[5, 5, 5]} fov={50} />
        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI / 1.75} />
        
        <AmbientLight intensity={1.5} />
        <PointLight position={[10, 10, 10]} intensity={1} castShadow />
        <SpotLight position={[-10, 10, 10]} angle={0.15} penumbra={1} intensity={1} castShadow />

        <Center top>
          <Float speed={1.5} rotationIntensity={0.5} floatIntensity={0.5}>
            {manifest.components.map((comp, i) => (
              <ComponentPrimitive 
                key={`${comp.partId}-${i}`} 
                component={comp} 
                index={i} 
                explode={explode} 
                axis={manifest.stackAxis}
              />
            ))}
          </Float>
        </Center>

        <Grid
          infiniteGrid
          cellSize={1}
          sectionSize={5}
          sectionThickness={1}
          fadeDistance={30}
          sectionColor="#e2e8f0"
          cellColor="#cbd5e1"
        />
      </Canvas>

      {/* Explosion Control Overlay */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-col gap-1.5 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="flex justify-between items-center text-[9px] font-bold text-gray-400 uppercase tracking-[0.2em] px-2">
          <span>Condensed</span>
          <span>Exploded View</span>
        </div>
        <input 
          type="range" 
          min="0" 
          max="3" 
          step="0.01" 
          value={explode} 
          onChange={(e) => setExplode(parseFloat(e.target.value))}
          className="w-full h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-indigo-600 pointer-events-auto shadow-sm"
        />
      </div>

      <div className="absolute top-4 left-4 flex flex-col gap-1">
        <Chip label="Procedural Draft" color="bg-white/80 backdrop-blur-sm text-indigo-700 border border-indigo-100 shadow-sm" />
      </div>
    </div>
  );
};
