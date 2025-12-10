import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Environment, OrbitControls, PerspectiveCamera, Stars } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import { TreeState, AppConfig, PhotoData } from '../types';
import Foliage from './Foliage';
import Ornaments from './Ornaments';
import PhotoOrnaments from './PhotoOrnaments';
import Snow from './Snow';

interface ExperienceProps {
  treeState: TreeState;
  config: AppConfig;
  photos: PhotoData[];
}

// Extracted for cleaner structure and moved up to prevent hoisting issues
const RotatingTreeGroup: React.FC<{
  treeState: TreeState;
  config: AppConfig;
  isZoomed: boolean;
  children: React.ReactNode;
}> = ({ treeState, config, isZoomed, children }) => {
    const groupRef = useRef<THREE.Group>(null);
    useFrame((state, delta) => {
        if (groupRef.current) {
            const isFormed = treeState === 'FORMED';
            
            // Rotation Logic: Stop rotation if zoomed to prevent shaking/jitter
            let rotSpeed = isFormed ? config.rotationSpeed * 0.5 : 0.02;
            if (isZoomed) {
                rotSpeed = 0;
            }
            
            groupRef.current.rotation.y += rotSpeed * delta;
            
            // Tilt Effect (Y component rotates scene X)
            // Also disable tilt when zoomed for stability
            if (!isFormed && !isZoomed) {
                // Gentle auto-tilt in chaos mode
                groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, Math.sin(state.clock.elapsedTime * 0.5) * 0.1, delta);
            } else {
                // Reset to upright (0) when formed OR zoomed
                groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, 0, delta * 2);
            }
        }
    });
    return (
        <group ref={groupRef} position={[0, -5, 0]}>
            <Foliage treeState={treeState} particleSize={config.particleSize} />
            <Ornaments treeState={treeState} globalScale={config.ornamentScale} count={config.ornamentCount} />
            {children}
        </group>
    )
}

const Experience: React.FC<ExperienceProps> = ({ 
  treeState, 
  config, 
  photos, 
}) => {
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  // 直接使用本地 HDR 文件
  const envUrl = './st_fagans_interior_1k.hdr';

  // Listen for WebGL context loss to avoid EffectComposer crashing on null context
  useEffect(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const handleLost = (e: Event) => {
      e.preventDefault(); // request automatic restore if possible
      setContextLost(true);
      console.warn('WebGL context lost – disabling postprocessing until restored.');
    };
    const handleRestored = () => {
      setContextLost(false);
      console.info('WebGL context restored – re‑enabling postprocessing.');
    };

    canvas.addEventListener('webglcontextlost', handleLost);
    canvas.addEventListener('webglcontextrestored', handleRestored);

    return () => {
      canvas.removeEventListener('webglcontextlost', handleLost);
      canvas.removeEventListener('webglcontextrestored', handleRestored);
    };
  }, []);

  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: false, toneMappingExposure: 1.5 }}
    >
      <PerspectiveCamera makeDefault position={[0, 2, 22]} fov={45} />
      <OrbitControls 
        enabled={!zoomedId}
        enablePan={false} 
        maxPolarAngle={Math.PI / 1.8} 
        minDistance={10}
        maxDistance={35}
        enableRotate={true}
        autoRotate={false}
      />

      {/* Lighting & Environment */}
      <ambientLight intensity={0.2} color="#001100" />
      
      {/* Load Environment from local HDR file */}
      <Environment
        files={envUrl}
        backgroundBlurriness={0.8}
      />
      
      <spotLight 
        position={[10, 20, 10]} 
        angle={0.25} 
        penumbra={1} 
        intensity={200} 
        color="#fffae0" 
        castShadow 
      />
      <pointLight position={[-5, 5, -5]} intensity={50} color="#D4AF37" />

      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      
      {/* Snow Effect - Conditionally rendered */}
      {config.showSnow && (
        <Snow count={config.snowCount} size={config.snowSize} />
      )}

      <Suspense fallback={null}>
        {/* We need to inject PhotoOrnaments into the rotating group. */}
        <RotatingTreeGroup 
           treeState={treeState} 
           config={config} 
           isZoomed={!!zoomedId}
        >
           <PhotoOrnaments 
              photos={photos} 
              treeState={treeState} 
              globalScale={config.photoScale}
              zoomedId={zoomedId}
              setZoomedId={setZoomedId}
           />
        </RotatingTreeGroup>
      </Suspense>
      
      {/* Guard postprocessing so we don't call EffectComposer when context is lost */}
      {!contextLost && (
        <EffectComposer enableNormalPass={false}>
          <Bloom 
              luminanceThreshold={0.8} 
              mipmapBlur 
              intensity={1.2} 
              radius={0.4}
          />
          <Vignette eskil={false} offset={0.1} darkness={1.1} />
          <Noise opacity={0.02} />
        </EffectComposer>
      )}
    </Canvas>
  );
};

export default Experience;
