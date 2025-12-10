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
  
  // State for the twinkling effect - 支持多个同时闪烁
  const twinkleRef = useRef<{
    active: Array<{
      index: number;
      startTime: number;
      duration: number;
      originalColor: THREE.Color;
    }>;
    nextTwinkleTime: number;
  }>({
    active: [],
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
      // 使用幂函数使分布偏向底部 - 指数越大底部越密集
      const yT = Math.pow(Math.random(), 1.8) * height * 0.9 + 0.5;
      
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

    // --- Twinkle/Flash Logic - 多个同时闪烁 ---
    const twinkle = twinkleRef.current;
    const maxActiveTwinkles = 5; // 最多同时闪烁数量

    // 1. 触发新的闪烁
    if (twinkle.active.length < maxActiveTwinkles && time > twinkle.nextTwinkleTime) {
        // 随机选择一个未在闪烁的装饰球
        let newIndex: number;
        let attempts = 0;
        do {
            newIndex = Math.floor(Math.random() * count);
            attempts++;
        } while (twinkle.active.some(t => t.index === newIndex) && attempts < 10);

        if (attempts < 10 && meshRef.current.instanceColor) {
            const originalColor = new THREE.Color();
            meshRef.current.getColorAt(newIndex, originalColor);

            twinkle.active.push({
                index: newIndex,
                startTime: time,
                duration: 0.3 + Math.random() * 0.4, // 0.3-0.7秒随机持续时间
                originalColor: originalColor.clone()
            });
        }

        // 下次触发间隔 (0.05s - 0.2s，更频繁)
        twinkle.nextTwinkleTime = time + 0.05 + Math.random() * 0.15;
    }

    // 2. 更新所有活跃的闪烁
    const completedIndices: number[] = [];

    twinkle.active.forEach((t, i) => {
        const elapsed = time - t.startTime;
        const progress = elapsed / t.duration;

        if (progress >= 1) {
            // 闪烁结束，恢复原色
            meshRef.current!.setColorAt(t.index, t.originalColor);
            completedIndices.push(i);
        } else {
            // 使用正弦波产生闪烁效果 (0 -> 1 -> 0)
            const intensity = Math.sin(progress * Math.PI);

            const flashColor = new THREE.Color().copy(t.originalColor);
            // 混合到高亮白色，产生 HDR 辉光效果
            flashColor.lerp(new THREE.Color(2.0, 2.0, 1.8), intensity * 0.9);

            meshRef.current!.setColorAt(t.index, flashColor);
        }
    });

    // 移除已完成的闪烁（从后往前删除避免索引问题）
    for (let i = completedIndices.length - 1; i >= 0; i--) {
        twinkle.active.splice(completedIndices[i], 1);
    }

    // 标记颜色需要更新
    if (meshRef.current.instanceColor && twinkle.active.length > 0) {
        meshRef.current.instanceColor.needsUpdate = true;
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