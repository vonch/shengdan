import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface SnowProps {
  count: number;
  size: number;
}

const Snow: React.FC<SnowProps> = ({ count, size }) => {
  const pointsRef = useRef<THREE.Points>(null);
  
  // Create a soft circle texture programmatically
  const texture = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext('2d');
    if (context) {
        const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 32, 32);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  // Generate initial positions and velocity data
  // Dependent on `count`, will re-run when count changes
  const particles = useMemo(() => {
    const tempPositions = new Float32Array(count * 3);
    const tempUserData = [];

    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 50;
      const y = (Math.random() - 0.5) * 40;
      const z = (Math.random() - 0.5) * 40;

      tempPositions[i * 3] = x;
      tempPositions[i * 3 + 1] = y;
      tempPositions[i * 3 + 2] = z;

      tempUserData.push({
        velocity: Math.random() * 0.05 + 0.02,
        drift: Math.random() * 0.02 - 0.01,
        swaySpeed: Math.random() * 2,
        initialX: x,
        initialZ: z
      });
    }

    return { positions: tempPositions, data: tempUserData };
  }, [count]);

  useFrame((state) => {
    const points = pointsRef.current;
    if (!points) return;
    
    const geometry = points.geometry;
    if (!geometry) return;
    
    // Safer access to attribute
    const positionAttribute = geometry.getAttribute('position') as THREE.BufferAttribute;
    if (!positionAttribute) return;

    const positions = positionAttribute.array as Float32Array;
    const time = state.clock.getElapsedTime();

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const userData = particles.data[i];

      // Update Y (Fall)
      positions[i3 + 1] -= userData.velocity;

      // Reset if below bottom threshold
      if (positions[i3 + 1] < -20) {
        positions[i3 + 1] = 20;
        positions[i3] = (Math.random() - 0.5) * 50; 
        positions[i3 + 2] = (Math.random() - 0.5) * 40;
      }

      // Add simple wind sway
      positions[i3] += Math.sin(time * userData.swaySpeed) * 0.01 + userData.drift;
    }

    positionAttribute.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} position={[0, 0, 0]} key={count}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      {texture && (
        <pointsMaterial
            size={size}
            map={texture}
            transparent
            opacity={0.8}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            color="#ffffff"
        />
      )}
    </points>
  );
};

export default Snow;