import React, { useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Image } from '@react-three/drei';
import { PhotoData, TreeState } from '../types';

interface PhotoOrnamentsProps {
  photos: PhotoData[];
  treeState: TreeState;
  globalScale: number;
  zoomedId: string | null;
  setZoomedId: (id: string | null) => void;
}

const PhotoFrame: React.FC<{ 
  data: PhotoData; 
  treeState: TreeState; 
  index: number;
  globalScale: number;
  isZoomed: boolean;
  onToggleZoom: (id: string) => void;
}> = ({ data, treeState, globalScale, isZoomed, onToggleZoom }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [mouseHovered, setMouseHovered] = useState(false);
  const { camera, size } = useThree();
  
  const randomOffset = useMemo(() => Math.random() * 100, []);
  const zoomProgress = useRef(0);

  // Use renderPriority=1000 to ensure this runs AFTER the parent group rotation update and Camera updates.
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    camera.updateMatrixWorld();

    const isFormed = treeState === 'FORMED';
    
    // 1. Calculate "Tree-Attached" State (Local Space)
    let treePos = isFormed ? data.positionTarget : data.positionChaos;
    let treeRot = isFormed 
      ? new THREE.Euler(0, -Math.atan2(data.positionTarget.z, data.positionTarget.x) + Math.PI / 2, 0)
      : new THREE.Euler(Math.sin(state.clock.elapsedTime * 0.1), Math.cos(state.clock.elapsedTime * 0.1), 0);
    
    const floatY = Math.sin(state.clock.elapsedTime + randomOffset) * 0.2;
    const treePosFloated = treePos.clone().add(new THREE.Vector3(0, floatY, 0));
    
    const targetProgress = isZoomed ? 1.0 : 0.0;
    zoomProgress.current = THREE.MathUtils.lerp(zoomProgress.current, targetProgress, 0.1);

    if (Math.abs(zoomProgress.current - targetProgress) < 0.005) {
        zoomProgress.current = targetProgress;
    }

    const t = zoomProgress.current;

    // 2. Calculate "Screen-Fixed" State
    const distFromCamera = 6;
    const targetWorldPos = new THREE.Vector3(0, 0, -distFromCamera);
    targetWorldPos.applyMatrix4(camera.matrixWorld);
    
    const targetWorldQuat = camera.quaternion.clone();

    const vFov = (camera as THREE.PerspectiveCamera).fov * Math.PI / 180;
    const visibleHeight = 2 * Math.tan(vFov / 2) * distFromCamera;
    const aspect = size.width / size.height;
    const visibleWidth = visibleHeight * aspect;
    
    const frameW = 2.2;
    const frameH = 2.7;
    const padding = 0.85; 
    
    const scaleH = (visibleHeight * padding) / frameH;
    const scaleW = (visibleWidth * padding) / frameW;
    const targetScreenScale = Math.min(scaleH, scaleW);

    const screenPosLocal = new THREE.Vector3();
    const screenRotLocal = new THREE.Quaternion();

    if (groupRef.current.parent) {
        const parent = groupRef.current.parent;
        // Ensuring parent matrix is up-to-date.
        // Since we stop parent rotation when zoomed, this becomes very stable.
        parent.updateWorldMatrix(true, false);
        
        const parentWorldInverse = parent.matrixWorld.clone().invert();
        const parentQuat = new THREE.Quaternion().setFromRotationMatrix(parent.matrixWorld);

        screenPosLocal.copy(targetWorldPos).applyMatrix4(parentWorldInverse);
        screenRotLocal.copy(parentQuat.invert().multiply(targetWorldQuat));
    }

    // 3. Interpolate
    if (t >= 0.995) {
        groupRef.current.position.copy(screenPosLocal);
        groupRef.current.quaternion.copy(screenRotLocal);
        groupRef.current.scale.setScalar(targetScreenScale);
    } else if (t <= 0.005) {
        groupRef.current.position.copy(treePosFloated);
        const qTree = new THREE.Quaternion().setFromEuler(treeRot);
        groupRef.current.quaternion.copy(qTree);
        groupRef.current.scale.setScalar(globalScale);
    } else {
        groupRef.current.position.lerpVectors(treePosFloated, screenPosLocal, t);
        const qTree = new THREE.Quaternion().setFromEuler(treeRot);
        groupRef.current.quaternion.slerpQuaternions(qTree, screenRotLocal, t);
        const targetTreeScale = globalScale;
        const finalScale = THREE.MathUtils.lerp(targetTreeScale, targetScreenScale, t);
        groupRef.current.scale.setScalar(finalScale);
    }

    if (mouseHovered && !isZoomed) {
        groupRef.current.scale.multiplyScalar(1.1);
    }

  }, 1000);

  return (
    <group 
        ref={groupRef} 
        position={data.positionChaos} 
        onClick={(e) => {
            e.stopPropagation();
            onToggleZoom(data.id);
        }}
        onPointerOver={() => {
            document.body.style.cursor = 'pointer';
            setMouseHovered(true);
        }}
        onPointerOut={() => {
            document.body.style.cursor = 'auto';
            setMouseHovered(false);
        }}
        renderOrder={zoomProgress.current > 0.1 ? 999 : 0}
        userData={{ photoId: data.id }} 
    >
      <mesh position={[0, 0, -0.1]}>
        <boxGeometry args={[2.2, 2.7, 0.1]} />
        <meshStandardMaterial 
            color="#D4AF37" 
            metalness={1} 
            roughness={0.2} 
            envMapIntensity={2} 
            emissive={mouseHovered ? "#D4AF37" : "#000000"}
            emissiveIntensity={mouseHovered ? 0.5 : 0}
        />
      </mesh>
      
      <Image 
        url={data.url} 
        position={[0, 0, 0.01]}
        scale={[2, 2.5]} 
        transparent
        opacity={mouseHovered || isZoomed ? 1 : 0.9}
        color={mouseHovered || isZoomed ? 'white' : '#e0e0e0'}
      />
    </group>
  );
};

const PhotoOrnaments: React.FC<PhotoOrnamentsProps> = ({ photos, treeState, globalScale, zoomedId, setZoomedId }) => {
  const handleToggleZoom = (id: string) => {
      setZoomedId(zoomedId === id ? null : id);
  };

  return (
    <group>
      {photos.map((photo, i) => (
        <PhotoFrame 
          key={photo.id} 
          index={i}
          data={photo} 
          treeState={treeState} 
          globalScale={globalScale}
          isZoomed={zoomedId === photo.id}
          onToggleZoom={handleToggleZoom}
        />
      ))}
    </group>
  );
};

export default PhotoOrnaments;