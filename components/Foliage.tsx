import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TreeState } from '../types';

// Custom Shader for performance and visual control
const FoliageShaderMaterial = {
  vertexShader: `
    uniform float uTime;
    uniform float uProgress;
    uniform float uSize;
    
    attribute vec3 aPositionChaos;
    attribute vec3 aPositionTarget;
    attribute float aRandom;
    
    varying vec2 vUv;
    varying float vAlpha;
    varying float vRandom;

    // Cubic easing out
    float easeOutCubic(float x) {
      return 1.0 - pow(1.0 - x, 3.0);
    }

    void main() {
      vUv = uv;
      vRandom = aRandom;
      
      float easedProgress = easeOutCubic(uProgress);
      
      // Mix positions based on progress
      vec3 pos = mix(aPositionChaos, aPositionTarget, easedProgress);
      
      // Add subtle "breathing" or wind animation
      float wind = sin(uTime * 2.0 + pos.y * 0.5) * 0.1 * (1.0 - easedProgress * 0.5);
      pos.x += wind;
      
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      
      // Size attenuation based on depth
      // Multiplied by uSize for user control
      gl_PointSize = (60.0 * aRandom + 20.0) * uSize * (1.0 / -mvPosition.z);
      
      gl_Position = projectionMatrix * mvPosition;
      
      // Fade out slightly when chaotic
      vAlpha = 0.6 + 0.4 * easedProgress;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    varying float vAlpha;
    varying float vRandom;

    void main() {
      // Circular particle
      vec2 center = gl_PointCoord - 0.5;
      float dist = length(center);
      if (dist > 0.5) discard;

      // Base Emerald Color
      vec3 color = vec3(0.016, 0.224, 0.153); // Deep Emerald
      
      // Add Gold Glint
      float glint = sin(uTime * 3.0 + vRandom * 100.0) * 0.5 + 0.5;
      if (glint > 0.95) {
        color = mix(color, vec3(1.0, 0.9, 0.6), 0.8); // Sparkle
      }

      // Gradient on particle
      float gradient = 1.0 - dist * 2.0;
      
      gl_FragColor = vec4(color * 1.5, vAlpha * gradient);
    }
  `
};

interface FoliageProps {
  treeState: TreeState;
  particleSize: number;
}

const Foliage: React.FC<FoliageProps> = ({ treeState, particleSize }) => {
  const meshRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  // Count of particles
  const count = 15000;

  // Generate Geometry Data
  const { positionsChaos, positionsTarget, randoms } = useMemo(() => {
    const pChaos = new Float32Array(count * 3);
    const pTarget = new Float32Array(count * 3);
    const rands = new Float32Array(count);

    const height = 12;
    const maxRadius = 5.5;

    for (let i = 0; i < count; i++) {
      // 1. Chaos Position: Random Sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 2) - 1);
      const radiusChaos = 15 + Math.random() * 10; // Large sphere radius
      
      const xC = radiusChaos * Math.sin(phi) * Math.cos(theta);
      const yC = radiusChaos * Math.sin(phi) * Math.sin(theta);
      const zC = radiusChaos * Math.cos(phi);
      
      pChaos[i * 3] = xC;
      pChaos[i * 3 + 1] = yC + 6; // Center sphere higher
      pChaos[i * 3 + 2] = zC;

      // 2. Target Position: Cone (Tree)
      // Spiral distribution for uniform coverage
      const yT = Math.random() * height;
      const normalizedY = yT / height;
      const radiusAtY = (1 - normalizedY) * maxRadius;
      // Add thickness to tree
      const r = Math.sqrt(Math.random()) * radiusAtY; 
      const angle = i * 2.4; // Golden angle approx for spiral

      const xT = r * Math.cos(angle);
      const zT = r * Math.sin(angle);

      pTarget[i * 3] = xT;
      pTarget[i * 3 + 1] = yT;
      pTarget[i * 3 + 2] = zT;

      // 3. Randoms
      rands[i] = Math.random();
    }

    return {
      positionsChaos: pChaos,
      positionsTarget: pTarget,
      randoms: rands
    };
  }, []);

  // Memoize uniforms so the object reference remains stable across renders.
  // This prevents R3F from resetting the uniforms to their default values 
  // every time the component re-renders (which happens when particleSize prop changes).
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uProgress: { value: 0 },
    uSize: { value: 1.0 }
  }), []);

  useFrame((state) => {
    if (materialRef.current) {
      const targetProgress = treeState === 'FORMED' ? 1.0 : 0.0;
      // Lerp the uniform for smooth transition
      materialRef.current.uniforms.uProgress.value = THREE.MathUtils.lerp(
        materialRef.current.uniforms.uProgress.value,
        targetProgress,
        0.02 // Speed of foliage morph
      );
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
      
      // Update size dynamically from prop
      materialRef.current.uniforms.uSize.value = particleSize;
    }
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positionsTarget} // Initial bounds (dummy)
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aPositionChaos"
          count={count}
          array={positionsChaos}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aPositionTarget"
          count={count}
          array={positionsTarget}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-aRandom"
          count={count}
          array={randoms}
          itemSize={1}
        />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        args={[FoliageShaderMaterial]}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={uniforms}
      />
    </points>
  );
};

export default Foliage;