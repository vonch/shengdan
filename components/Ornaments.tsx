import React, { useMemo, useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState, OrnamentData, COLORS } from '../types';

interface OrnamentsProps {
  treeState: TreeState;
  globalScale: number;
  count: number;
}

const Ornaments: React.FC<OrnamentsProps> = ({ treeState, globalScale, count }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  
  // State for the twinkling effect
  const twinkleRef = useRef({
      index: -1,
      startTime: 0,
      duration: 0.5, // seconds for a full flash
      originalColor: new THREE.Color(),
      nextTwinkleTime: 0
  });

  // Generate Data
  const ornaments = useMemo<OrnamentData[]>(() => {
    const data: OrnamentData[] = [];
    const height = 11.5; // Slightly smaller than tree
    const maxRadius = 5.0;

    const palette = [COLORS.GOLD, COLORS.RED_VELVET, '#ffffff', COLORS.GOLD];

    for (let i = 0; i < count; i++) {
      // Target (Tree)
      const yT = Math.random() * height * 0.9 + 0.5; // Keep off very bottom/top
      const normalizedY = yT / height;
      const radiusAtY = (1 - normalizedY) * maxRadius;
      
      // Place on outer shell mostly
      const r = radiusAtY * (0.8 + Math.random() * 0.2); 
      const theta = Math.random() * Math.PI * 2;

      const target = new THREE.Vector3(
        r * Math.cos(theta),
        yT,
        r * Math.sin(theta)
      );

      // Chaos (Sphere)
      const chaosR = 20 + Math.random() * 10;
      const chaosTheta = Math.random() * Math.PI * 2;
      const chaosPhi = Math.acos((Math.random() * 2) - 1);
      const chaos = new THREE.Vector3(
        chaosR * Math.sin(chaosPhi) * Math.cos(chaosTheta),
        chaosR * Math.sin(chaosPhi) * Math.sin(chaosTheta) + 5,
        chaosR * Math.cos(chaosPhi)
      );

      data.push({
        positionChaos: chaos,
        positionTarget: target,
        color: palette[Math.floor(Math.random() * palette.length)],
        type: Math.random() > 0.8 ? 'box' : 'sphere', // 20% boxes
        scale: Math.random() * 0.4 + 0.2,
        speed: Math.random() * 0.03 + 0.01, // Random lerp speed
        rotationSpeed: Math.random() * 0.02
      });
    }
    return data;
  }, [count]);

  useLayoutEffect(() => {
    if (meshRef.current) {
      ornaments.forEach((data, i) => {
        dummy.position.copy(data.positionChaos);
        dummy.scale.setScalar(data.scale * globalScale);
        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
        meshRef.current!.setColorAt(i, new THREE.Color(data.color));
      });
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [ornaments, dummy, globalScale]);

  useFrame((state) => {
    if (!meshRef.current) return;

    const isFormed = treeState === 'FORMED';
    const time = state.clock.elapsedTime;

    // --- Animation & Movement Logic ---
    ornaments.forEach((data, i) => {
        // Extract current Matrix to get position
        meshRef.current!.getMatrixAt(i, dummy.matrix);
        dummy.matrix.decompose(dummy.position, dummy.quaternion, dummy.scale);

        const targetPos = isFormed ? data.positionTarget : data.positionChaos;
        
        // Lerp position based on individual weight (speed)
        dummy.position.lerp(targetPos, data.speed);

        // Rotate slightly
        if (isFormed) {
             dummy.rotation.y += data.rotationSpeed;
             dummy.rotation.x += data.rotationSpeed;
        } else {
             dummy.rotation.x += data.rotationSpeed * 5;
             dummy.rotation.z += data.rotationSpeed * 5;
        }
        
        // Update scale dynamically
        dummy.scale.setScalar(data.scale * globalScale);

        dummy.updateMatrix();
        meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    
    meshRef.current.instanceMatrix.needsUpdate = true;

    // --- Twinkle/Flash Logic ---
    const twinkle = twinkleRef.current;
    
    // 1. Pick a new ornament to twinkle if none active and time is right
    if (twinkle.index === -1 && time > twinkle.nextTwinkleTime) {
        twinkle.index = Math.floor(Math.random() * count);
        twinkle.startTime = time;
        // Get original color
        if (meshRef.current.instanceColor) {
             // Three.js InstancedMesh stores colors in a buffer attribute
             // We can use getColorAt to retrieve it into a temp color
             meshRef.current.getColorAt(twinkle.index, twinkle.originalColor);
        } else {
             // Fallback if no instance color exists yet (shouldn't happen)
             twinkle.originalColor.set(ornaments[twinkle.index].color);
        }
        
        // Randomize next interval (0.2s to 1.5s gap)
        twinkle.nextTwinkleTime = time + twinkle.duration + Math.random() * 1.0 + 0.2;
    }

    // 2. Animate the active twinkle
    if (twinkle.index !== -1) {
        const elapsed = time - twinkle.startTime;
        const progress = elapsed / twinkle.duration; // 0 to 1

        if (progress >= 1) {
            // Finished: Restore original color exactly and reset
            meshRef.current.setColorAt(twinkle.index, twinkle.originalColor);
            twinkle.index = -1;
        } else {
            // Animating: Sine wave for intensity (0 -> 1 -> 0)
            // 0 at start, 1 at mid (0.5), 0 at end
            const intensity = Math.sin(progress * Math.PI);
            
            // Mix original color with bright white
            // We use a temp color object to avoid allocating memory every frame
            const flashColor = new THREE.Color().copy(twinkle.originalColor);
            // Lerp towards white
            flashColor.lerp(new THREE.Color(1.5, 1.5, 1.5), intensity * 0.8); // 1.5 for HDR glow
            
            meshRef.current.setColorAt(twinkle.index, flashColor);
        }
        
        // Mark colors as needing update
        if (meshRef.current.instanceColor) {
            meshRef.current.instanceColor.needsUpdate = true;
        }
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
    >
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial 
        roughness={0.2} 
        metalness={0.9} 
        envMapIntensity={2.0}
      />
    </instancedMesh>
  );
};

export default Ornaments;