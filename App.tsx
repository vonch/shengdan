import React, { useState, useMemo, useEffect, Suspense } from 'react';
import { Vector3 } from 'three';
import Experience from './components/Experience';
import Overlay from './components/Overlay';
import LoadingScreen from './components/LoadingScreen';
import { TreeState, AppConfig, PhotoData } from './types';
import { supabase } from './supabaseClient';

const App: React.FC = () => {
  const [treeState, setTreeState] = useState<TreeState>('CHAOS');
  const [config, setConfig] = useState<AppConfig>({
    particleSize: 1.0,
    rotationSpeed: 0.5,
    ornamentScale: 1.0,
    photoScale: 1.0,
    ornamentCount: 300,
    musicUrl: 'https://cdn.pixabay.com/audio/2025/10/28/audio_b06293305b.mp3',
    showSnow: true,
    snowCount: 1500,
    snowSize: 0.2,
  });
  
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSharingLoading, setIsSharingLoading] = useState(false);
  const [isSharedMode, setIsSharedMode] = useState(false);
  
  useEffect(() => {
    console.log("[System] App Mounted. Initializing...");
  }, []);

  // Check for shared tree ID on mount
  useEffect(() => {
    const loadSharedTree = async () => {
      const params = new URLSearchParams(window.location.search);
      const shareId = params.get('share');

      if (shareId) {
        setIsSharingLoading(true);
        setIsSharedMode(true);
        console.log("Loading shared tree:", shareId);
        
        try {
          const { data, error } = await supabase
            .from('trees')
            .select('photos') // Only select existing columns
            .eq('id', shareId)
            .single();

          if (error) throw error;

          if (data && data.photos) {
            let loadedPhotosRaw = data.photos;
            let loadedConfig = null;

            // Handle new format where config is wrapped inside 'photos' column
            // Check if it's not an array, but an object containing 'photos' array
            if (!Array.isArray(loadedPhotosRaw) && loadedPhotosRaw.photos && Array.isArray(loadedPhotosRaw.photos)) {
                loadedConfig = loadedPhotosRaw.config;
                loadedPhotosRaw = loadedPhotosRaw.photos;
            }

            if (loadedPhotosRaw && Array.isArray(loadedPhotosRaw)) {
                // Reconstruct Vector3 objects from JSON data
                const loadedPhotos = loadedPhotosRaw.map((p: any) => ({
                ...p,
                positionChaos: new Vector3(p.positionChaos.x, p.positionChaos.y, p.positionChaos.z),
                positionTarget: new Vector3(p.positionTarget.x, p.positionTarget.y, p.positionTarget.z),
                }));
                setPhotos(loadedPhotos);
            }
            
            if (loadedConfig) {
                setConfig(prev => ({ ...prev, ...loadedConfig }));
            }

            setTreeState('FORMED');
          }
        } catch (err) {
          console.error("Error loading shared tree:", err);
          alert("Failed to load the shared Christmas Tree. It may have been deleted.");
        } finally {
          setIsSharingLoading(false);
        }
      }
    };

    loadSharedTree();
  }, []);

  const toggleState = () => {
    setTreeState((prev) => (prev === 'CHAOS' ? 'FORMED' : 'CHAOS'));
  };

  /**
   * Recalculates target positions for all photos to ensure a balanced, 
   * non-overlapping distribution on the tree surface using a Golden Spiral.
   */
  const recalculateLayout = (currentPhotos: PhotoData[]): PhotoData[] => {
    const count = currentPhotos.length;
    if (count === 0) return [];

    return currentPhotos.map((photo, i) => {
      // Formed: Golden Spiral on Cone
      // Height range: 0.5 to 10.5
      const height = 11;
      const yNormalized = (i + 0.5) / count; 
      const yT = 1 + yNormalized * 9; // Distribute from y=1 to y=10
      
      // Cone radius at height y
      // Base radius approx 5.5, tip approx 0
      const maxRadius = 5.5;
      const radiusAtY = (1 - (yT / height)) * maxRadius + 1.2; // +1.2 to hover slightly off surface
      
      const theta = i * 2.39996; // Golden Angle (~137.5 deg in rads)
      
      const posTarget = new Vector3(
        radiusAtY * Math.cos(theta),
        yT,
        radiusAtY * Math.sin(theta)
      );

      // Chaos: Generate random position if it doesn't exist OR if it's the placeholder (0,0,0)
      let posChaos = photo.positionChaos;
      // Check if posChaos is effectively zero (lengthSq < 0.01) or null/undefined
      if (!posChaos || (posChaos instanceof Vector3 && posChaos.lengthSq() < 0.01)) {
         const thetaC = Math.random() * Math.PI * 2;
         const phiC = Math.acos((Math.random() * 2) - 1);
         const radiusChaos = 18;
         posChaos = new Vector3(
          radiusChaos * Math.sin(phiC) * Math.cos(thetaC),
          radiusChaos * Math.sin(phiC) * Math.sin(thetaC) + 5,
          radiusChaos * Math.cos(phiC)
        );
      }

      return {
        ...photo,
        positionTarget: posTarget,
        positionChaos: posChaos
      };
    });
  };

  /**
   * Wrapper for setPhotos that ensures layout is recalculated whenever photos change.
   */
  const handleSetPhotos = (action: React.SetStateAction<PhotoData[]>) => {
    setPhotos(prev => {
      const nextPhotos = typeof action === 'function' ? action(prev) : action;
      return recalculateLayout(nextPhotos);
    });
  };

  const handleAddPhoto = (url: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    
    // Initial placeholder positions (will be fixed by recalculateLayout immediately)
    const newPhoto: PhotoData = {
      id,
      url,
      positionChaos: new Vector3(0, 0, 0), // Placeholder, will be randomized by recalculateLayout
      positionTarget: new Vector3(0, 0, 0), // Placeholder
      timestamp: Date.now()
    };

    handleSetPhotos(prev => [...prev, newPhoto]);
  };

  // Dynamic Sizing Logic
  // If > 5 photos, scale them down to fit better
  const sizeFactor = useMemo(() => {
    const count = photos.length;
    if (count <= 5) return 1.0;
    // Scale down as inverse square root of count to preserve total surface area roughly
    return Math.sqrt(5 / count);
  }, [photos.length]);

  // Merge dynamic scale into config passed to Experience
  const effectiveConfig = useMemo(() => ({
    ...config,
    photoScale: config.photoScale * sizeFactor
  }), [config, sizeFactor]);

  return (
    <div className="relative w-full h-full bg-[#021a12]">
      {/* Loading Screen Overlay */}
      <LoadingScreen 
        onFinished={() => setIsLoaded(true)} 
      />

      {/* Shared Loading Indicator */}
      {isSharingLoading && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center bg-[#021a12]/90 text-[#D4AF37]">
          <p className="animate-pulse tracking-widest font-['Cinzel']">OPENING GIFT...</p>
        </div>
      )}

      {/* Main App Content - Fades in when loaded */}
      <div className={`w-full h-full transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
        
        {/* 3D Scene Layer */}
        <div className="absolute inset-0 z-0">
          <Suspense fallback={null}>
            <Experience 
              treeState={treeState} 
              config={effectiveConfig} 
              photos={photos}
            />
          </Suspense>
        </div>

        {/* UI Overlay Layer */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          <Overlay 
            treeState={treeState} 
            onToggle={toggleState} 
            config={config}
            setConfig={setConfig}
            onAddPhoto={handleAddPhoto}
            photos={photos}
            setPhotos={handleSetPhotos}
            setTreeState={setTreeState}
            isSharedMode={isSharedMode}
            isLoaded={isLoaded}
          />
        </div>
      </div>
    </div>
  );
};

export default App;