import React, { useEffect, useState, useRef } from 'react';
import { useProgress } from '@react-three/drei';

interface LoadingScreenProps {
  onFinished: () => void;
}

const LoadingScreen: React.FC<LoadingScreenProps> = ({ onFinished }) => {
  const { active, progress, errors, item, loaded, total } = useProgress();
  const [visible, setVisible] = useState(true);
  const [displayedProgress, setDisplayedProgress] = useState(0);

  // Smooth progress bar animation to prevent 0 -> 100 jumps
  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
      setDisplayedProgress((prev) => {
        const diff = progress - prev;
        // If close enough, just snap to it (unless it's 0 and we are just starting)
        if (Math.abs(diff) < 0.5) return progress;
        // Lerp towards the real progress value
        return prev + diff * 0.1;
      });
      animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [progress]);

  useEffect(() => {
    if (progress === 100) {
      console.log("[Loading Complete] All assets loaded.");
      const timer = setTimeout(() => {
        setVisible(false);
        onFinished();
      }, 1000); 
      return () => clearTimeout(timer);
    }
  }, [progress, onFinished]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-[100] flex flex-col items-center justify-center bg-[#021a12] text-[#D4AF37] font-['Cinzel'] transition-opacity duration-500">
      <div className="text-center space-y-4">
        <h1 className="text-3xl md:text-6xl font-bold tracking-widest text-gold-gradient drop-shadow-lg animate-pulse">
          GRAND CHRISTMAS
        </h1>
        <p className="text-xs md:text-sm tracking-[0.5em] opacity-60 uppercase">
          Winter Limited Edition
        </p>
      </div>

      <div className="mt-12 w-64 md:w-96 h-1 bg-[#043927] rounded-full overflow-hidden relative shadow-[0_0_20px_rgba(212,175,55,0.2)]">
        <div 
          className="absolute top-0 left-0 h-full bg-gradient-to-r from-[#b38b38] via-[#ffecb3] to-[#b38b38] transition-all duration-75 ease-linear box-shadow-[0_0_10px_#D4AF37]"
          style={{ width: `${displayedProgress}%` }}
        />
      </div>
      
      <div className="mt-4 flex flex-col items-center gap-1">
          <p className="text-[10px] md:text-xs tracking-[0.3em] opacity-80">
            LOADING EXPERIENCE... {Math.round(displayedProgress)}%
          </p>
          {item && (
              <p className="text-[8px] opacity-50 max-w-xs truncate text-center">
                  {item}
              </p>
          )}
      </div>
    </div>
  );
};

export default LoadingScreen;