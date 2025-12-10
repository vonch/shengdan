import React, { useState, useRef, useEffect } from 'react';
import { TreeState, AppConfig, PhotoData } from '../types';
import { supabase } from '../supabaseClient';

interface OverlayProps {
  treeState: TreeState;
  onToggle: () => void;
  config: AppConfig;
  setConfig: React.Dispatch<React.SetStateAction<AppConfig>>;
  onAddPhoto: (url: string) => void;
  photos: PhotoData[];
  setPhotos: React.Dispatch<React.SetStateAction<PhotoData[]>>;
  setTreeState: React.Dispatch<React.SetStateAction<TreeState>>;
  isSharedMode: boolean;
  isLoaded: boolean;
}

// Utility function to compress images
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        // Calculate new dimensions
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            reject(new Error("Could not get canvas context"));
            return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        // Compress to JPEG with 0.7 quality
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            reject(new Error("Compression failed"));
          }
        }, 'image/jpeg', 0.7);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

const Overlay: React.FC<OverlayProps> = ({ 
  treeState, 
  onToggle, 
  config, 
  setConfig, 
  onAddPhoto,
  photos,
  setPhotos,
  setTreeState,
  isSharedMode,
  isLoaded
}) => {
  const isFormed = treeState === 'FORMED';
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false); // New state for local compression
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Music Player State
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Handle Music URL updates
  useEffect(() => {
    if (audioRef.current) {
        // If URL changes, update source
        const wasPlaying = !audioRef.current.paused;
        audioRef.current.src = config.musicUrl;
        if (wasPlaying) {
             audioRef.current.play().catch(console.warn);
        }
    }
  }, [config.musicUrl]);

  // Initialize Audio
  useEffect(() => {
    if (isLoaded && !audioRef.current) {
        try {
            const audio = new Audio(config.musicUrl);
            audio.loop = true;
            audio.volume = 0.5;
            audioRef.current = audio;

            const attemptPlay = () => {
                if (!audioRef.current) return;
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            setIsPlaying(true);
                            window.removeEventListener('click', attemptPlay);
                            window.removeEventListener('touchstart', attemptPlay);
                            window.removeEventListener('keydown', attemptPlay);
                        })
                        .catch((err) => {
                            setIsPlaying(false);
                        });
                }
            };

            attemptPlay();
            window.addEventListener('click', attemptPlay);
            window.addEventListener('touchstart', attemptPlay);
            window.addEventListener('keydown', attemptPlay);
        } catch (e) {
            console.warn("Audio initialization failed:", e);
        }

        return () => {
            window.removeEventListener('click', () => {}); 
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current = null;
            }
        };
    }
  }, [isLoaded]); // Only run once on load (config.musicUrl updates handled by other effect)

  const toggleMusic = () => {
      if (!audioRef.current) return;

      if (isPlaying) {
          audioRef.current.pause();
          setIsPlaying(false);
      } else {
          audioRef.current.play().catch(e => console.warn("Play failed", e));
          setIsPlaying(true);
      }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch((e) => {
            console.warn("Fullscreen request failed", e);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
  };

  const handleSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, particleSize: parseFloat(e.target.value) }));
  };

  const handleSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, rotationSpeed: parseFloat(e.target.value) }));
  };
  
  const handleOrnamentScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, ornamentScale: parseFloat(e.target.value) }));
  };

  const handlePhotoScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, photoScale: parseFloat(e.target.value) }));
  };

  const handleOrnamentCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, ornamentCount: parseInt(e.target.value) }));
  };

  const handleMusicUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, musicUrl: e.target.value }));
  };
  
  const handleSnowCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, snowCount: parseInt(e.target.value) }));
  };

  const handleSnowSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig(prev => ({ ...prev, snowSize: parseFloat(e.target.value) }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        setIsProcessingPhotos(true);
        const files = Array.from(e.target.files);
        
        try {
            // Process files sequentially or in parallel
            const processedUrls = await Promise.all(files.map(file => compressImage(file)));
            
            processedUrls.forEach(url => {
                onAddPhoto(url);
            });

            setSettingsOpen(false);
            setTreeState('FORMED');
        } catch (error) {
            console.error("Error compressing images:", error);
            alert("图片处理失败，请重试");
        } finally {
            setIsProcessingPhotos(false);
            if (e.target) e.target.value = '';
        }
    }
  };

  const handleSort = (order: 'newest' | 'oldest') => {
    setPhotos(prev => {
      const sorted = [...prev].sort((a, b) => {
        if (order === 'newest') return b.timestamp - a.timestamp;
        return a.timestamp - b.timestamp;
      });
      return sorted;
    });
  };
  
  const handleDeletePhoto = (id: string) => {
    setPhotos(prev => prev.filter(p => p.id !== id));
  };

  const handleShare = async () => {
    if (photos.length === 0) {
        alert("请先上传照片再分享！");
        return;
    }

    setIsUploading(true);
    try {
        const { error: createBucketError } = await supabase.storage.createBucket('photos', {
            public: true
        });
        
        if (createBucketError && !createBucketError.message.toLowerCase().includes('already exists')) {
             console.warn("Bucket auto-creation attempted but failed:", createBucketError);
        }

        const updatedPhotos: PhotoData[] = [];

        for (const photo of photos) {
            if (photo.url.startsWith('blob:')) {
                const blob = await fetch(photo.url).then(r => r.blob());
                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
                
                const { data, error } = await supabase.storage
                    .from('photos')
                    .upload(fileName, blob);

                if (error) throw error;

                const { data: publicUrlData } = supabase.storage
                    .from('photos')
                    .getPublicUrl(fileName);

                updatedPhotos.push({
                    ...photo,
                    url: publicUrlData.publicUrl
                });
            } else {
                updatedPhotos.push(photo);
            }
        }

        setPhotos(updatedPhotos);

        // Pack photos and config into a single wrapper object to store in the 'photos' column
        const storagePayload = {
            photos: updatedPhotos,
            config: config
        };

        const { data, error } = await supabase
            .from('trees')
            .insert([
                { photos: storagePayload }
            ])
            .select()
            .single();

        if (error) throw error;

        const shareId = data.id;
        const link = `${window.location.origin}${window.location.pathname}?share=${shareId}`;
        setShareUrl(link);
        
    } catch (err: any) {
        console.error("Share failed details:", err);
        const msg = err.message || JSON.stringify(err);
        alert("分享失败: " + msg);
    } finally {
        setIsUploading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!shareUrl) return;

    try {
        // 优先使用 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(shareUrl);
            alert("链接已复制到剪贴板！");
        } else {
            // 降级方案：使用传统方法
            const textArea = document.createElement('textarea');
            textArea.value = shareUrl;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            alert("链接已复制到剪贴板！");
        }
    } catch (err) {
        console.error('复制失败:', err);
        // 最后的降级：提示用户手动复制
        prompt("请手动复制链接：", shareUrl);
    }
  };

  return (
    <div className="w-full h-full flex flex-col justify-between items-center py-8 px-6 font-['Cinzel'] text-[#D4AF37]">
      
      {/* Floating Loading Indicator Overlay (Shared for Upload and Processing) */}
      {(isUploading || isProcessingPhotos) && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
           <div className="relative w-20 h-20 mb-6">
               <div className="absolute inset-0 border-4 border-[#D4AF37]/20 rounded-full"></div>
               <div className="absolute inset-0 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
           </div>
           <p className="text-[#D4AF37] tracking-[0.2em] animate-pulse font-bold text-lg drop-shadow-[0_0_10px_rgba(212,175,55,0.5)]">
               {isUploading ? 'SAVING MEMORIES...' : 'PROCESSING PHOTOS...'}
           </p>
        </div>
      )}

      {/* Top Left: Music Player */}
      <div className="absolute top-6 left-6 pointer-events-auto z-50">
        <button 
            onClick={toggleMusic}
            className={`group flex items-center justify-center w-10 h-10 border border-[#D4AF37] rounded-full hover:bg-[#D4AF37]/10 transition-colors ${!isLoaded ? 'opacity-0 cursor-default' : 'opacity-100'}`}
            title={isPlaying ? "Pause Music" : "Play Music"}
            disabled={!isLoaded}
        >
            <div 
                className="w-full h-full flex items-center justify-center"
                style={{
                    animation: 'spin 4s linear infinite',
                    animationPlayState: isPlaying ? 'running' : 'paused'
                }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M9 13c0 1.105-1.12 2-2.5 2S4 14.105 4 13s1.12-2 2.5-2 2.5.895 2.5 2z"/>
                    <path fillRule="evenodd" d="M9 3v10H8V3h1z"/>
                    <path d="M8 2.82a1 1 0 0 1 .804-.98l3-.6A1 1 0 0 1 13 2.22V4L8 5V2.82z"/>
                </svg>
            </div>
        </button>
      </div>

      {/* Top Right: Settings & Fullscreen */}
      <div className="absolute top-6 right-6 pointer-events-auto z-50 flex gap-4">
        <button 
          onClick={toggleFullscreen}
          className="group p-2 border border-[#D4AF37] rounded-full hover:bg-[#D4AF37]/10 transition-colors"
          title="Toggle Fullscreen"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10 .5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 16 1.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zM.5 10a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 0 14.5v-4a.5.5 0 0 1 .5-.5zm15 0a.5.5 0 0 1 .5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5z"/>
          </svg>
        </button>

        <button 
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="group flex items-center gap-2 text-sm tracking-widest hover:text-[#fffae0] transition-colors"
        >
          <span className="uppercase font-bold hidden md:inline">设置</span>
          <div className="p-2 border border-[#D4AF37] rounded-full group-hover:bg-[#D4AF37]/10 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/>
              <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.377l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/>
            </svg>
          </div>
        </button>

        {settingsOpen && (
          <div className="absolute top-12 right-0 w-80 max-h-[80vh] overflow-y-auto bg-[#021a12]/95 backdrop-blur-md border border-[#D4AF37] p-6 shadow-2xl flex flex-col gap-6 animate-in fade-in slide-in-from-top-4 duration-300">
             <h4 className="text-[#D4AF37] border-b border-[#D4AF37]/50 pb-2 text-center uppercase tracking-widest font-bold">
               配置
             </h4>
             
             {/* Photo Collection Area - Moved to Top */}
             <div className="space-y-4 pb-4 border-b border-[#D4AF37]/30">
                {!isSharedMode ? (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs tracking-wider opacity-80 mb-2">
                      <span>照片集合 ({photos.length})</span>
                      <div className="flex gap-2 text-[10px] border border-[#D4AF37]/30 rounded overflow-hidden">
                        <button onClick={() => handleSort('newest')} className="hover:bg-[#D4AF37] hover:text-[#021a12] px-2 py-1 transition-colors">最新</button>
                        <button onClick={() => handleSort('oldest')} className="hover:bg-[#D4AF37] hover:text-[#021a12] px-2 py-1 transition-colors border-l border-[#D4AF37]/30">最旧</button>
                      </div>
                    </div>
                    
                    {photos.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {photos.map((photo) => (
                          <div key={photo.id} className="relative group/photo aspect-square">
                            <img 
                              src={photo.url} 
                              alt="照片" 
                              className="w-full h-full object-cover border border-[#D4AF37]/30 rounded-sm hover:border-[#D4AF37] transition-colors"
                            />
                            <button 
                              onClick={() => handleDeletePhoto(photo.id)}
                              className="absolute -top-1 -right-1 bg-red-900/90 text-white w-4 h-4 flex items-center justify-center rounded-full text-[10px] opacity-0 group-hover/photo:opacity-100 transition-opacity hover:bg-red-700 shadow-sm"
                              title="删除照片"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {photos.length === 0 && (
                      <p className="text-center text-xs italic opacity-50 py-2">暂无照片</p>
                    )}
                  </div>
                ) : (
                    <div className="pt-2">
                        <button 
                            onClick={() => window.location.href = window.location.origin + window.location.pathname}
                            className="w-full py-2 border border-[#D4AF37] text-xs uppercase tracking-widest hover:bg-[#D4AF37] hover:text-[#021a12] transition-colors"
                        >
                            我也要做一个
                        </button>
                    </div>
                )}

                {/* Upload & Share Section - Moved to Top */}
                {!isSharedMode && (
                  <div className="pt-2 space-y-3">
                      <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          accept="image/*"
                          multiple 
                          onChange={handleFileUpload}
                      />
                      <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-2 border border-[#D4AF37] text-xs uppercase tracking-widest hover:bg-[#D4AF37] hover:text-[#021a12] transition-colors"
                      >
                          上传照片
                      </button>

                      {photos.length > 0 && (
                        <button 
                            onClick={handleShare}
                            disabled={isUploading}
                            className={`w-full py-2 bg-[#D4AF37] text-[#021a12] text-xs uppercase tracking-widest font-bold hover:bg-[#b38b38] transition-colors ${isUploading ? 'opacity-50 cursor-wait' : ''}`}
                        >
                            {isUploading ? '正在保存...' : '保存并分享'}
                        </button>
                      )}

                      {shareUrl && (
                        <div className="bg-[#D4AF37]/10 p-2 rounded border border-[#D4AF37]/30 text-center animate-in fade-in zoom-in duration-300">
                          <p className="text-[10px] opacity-70 mb-1">分享链接已生成</p>
                          <div className="flex items-center gap-1">
                              <input 
                                  readOnly 
                                  value={shareUrl} 
                                  className="bg-black/30 border-none text-[10px] w-full p-1 text-[#D4AF37] rounded"
                              />
                              <button onClick={copyToClipboard} className="text-xs bg-[#D4AF37] text-black px-2 py-1 rounded">复制</button>
                          </div>
                        </div>
                      )}
                  </div>
                )}
             </div>
             
             {/* Music URL Input */}
             <div className="space-y-2">
               <div className="flex justify-between text-xs tracking-wider opacity-80">
                 <span>背景音乐链接</span>
               </div>
               <input 
                 type="text" 
                 value={config.musicUrl}
                 onChange={handleMusicUrlChange}
                 placeholder="输入 MP3 链接..."
                 className="w-full bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded px-2 py-1 text-xs text-[#D4AF37] focus:outline-none focus:border-[#D4AF37]"
               />
             </div>

             {/* Ornament Count Slider */}
             <div className="space-y-2">
               <div className="flex justify-between text-xs tracking-wider opacity-80">
                 <span>圣诞球数量</span>
                 <span>{config.ornamentCount}</span>
               </div>
               <input 
                 type="range" 
                 min="50" 
                 max="1000" 
                 step="50"
                 value={config.ornamentCount}
                 onChange={handleOrnamentCountChange}
                 className="w-full h-1 bg-[#D4AF37]/30 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
               />
             </div>

             {/* Ornament Scale Slider - Moved here and Renamed */}
             <div className="space-y-2">
               <div className="flex justify-between text-xs tracking-wider opacity-80">
                 <span>圣诞球大小</span>
                 <span>{config.ornamentScale.toFixed(1)}x</span>
               </div>
               <input 
                 type="range" 
                 min="0.5" 
                 max="2.5" 
                 step="0.1"
                 value={config.ornamentScale}
                 onChange={handleOrnamentScaleChange}
                 className="w-full h-1 bg-[#D4AF37]/30 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
               />
             </div>
             
             {/* Snow Controls */}
             <div className="space-y-2 pt-2 border-t border-[#D4AF37]/30">
               <div className="flex justify-between text-xs tracking-wider opacity-80">
                 <span>雪花数量</span>
                 <span>{config.snowCount}</span>
               </div>
               <input 
                 type="range" 
                 min="100" 
                 max="5000" 
                 step="100"
                 value={config.snowCount}
                 onChange={handleSnowCountChange}
                 disabled={!config.showSnow}
                 className={`w-full h-1 bg-[#D4AF37]/30 rounded-lg appearance-none cursor-pointer accent-[#D4AF37] ${!config.showSnow ? 'opacity-30 cursor-not-allowed' : ''}`}
               />
             </div>

             <div className="space-y-2">
               <div className="flex justify-between text-xs tracking-wider opacity-80">
                 <span>雪花大小</span>
                 <span>{config.snowSize.toFixed(1)}</span>
               </div>
               <input 
                 type="range" 
                 min="0.1" 
                 max="1.0" 
                 step="0.1"
                 value={config.snowSize}
                 onChange={handleSnowSizeChange}
                 disabled={!config.showSnow}
                 className={`w-full h-1 bg-[#D4AF37]/30 rounded-lg appearance-none cursor-pointer accent-[#D4AF37] ${!config.showSnow ? 'opacity-30 cursor-not-allowed' : ''}`}
               />
             </div>

             <div className="space-y-2 pt-2 border-t border-[#D4AF37]/30">
               <div className="flex justify-between text-xs tracking-wider opacity-80">
                 <span>粒子大小</span>
                 <span>{config.particleSize.toFixed(1)}x</span>
               </div>
               <input 
                 type="range" 
                 min="0.5" 
                 max="3.0" 
                 step="0.1"
                 value={config.particleSize}
                 onChange={handleSizeChange}
                 className="w-full h-1 bg-[#D4AF37]/30 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
               />
             </div>

             <div className="space-y-2">
               <div className="flex justify-between text-xs tracking-wider opacity-80">
                 <span>旋转速度</span>
                 <span>{config.rotationSpeed.toFixed(1)}</span>
               </div>
               <input 
                 type="range" 
                 min="0.0" 
                 max="2.0" 
                 step="0.1"
                 value={config.rotationSpeed}
                 onChange={handleSpeedChange}
                 className="w-full h-1 bg-[#D4AF37]/30 rounded-lg appearance-none cursor-pointer accent-[#D4AF37]"
               />
             </div>

             {/* Toggle Switches Group */}
             <div className="space-y-3 pt-2 border-t border-[#D4AF37]/30">
               {/* Snow Toggle */}
               <div className="flex justify-between items-center text-xs tracking-wider opacity-80">
                 <span>下雪特效</span>
                 <label className="relative inline-flex items-center cursor-pointer">
                   <input 
                     type="checkbox" 
                     checked={config.showSnow} 
                     onChange={(e) => setConfig(prev => ({ ...prev, showSnow: e.target.checked }))} 
                     className="sr-only peer" 
                   />
                   <div className="w-9 h-5 bg-[#021a12] border border-[#D4AF37]/50 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#D4AF37] after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#D4AF37]/20"></div>
                 </label>
               </div>
             </div>

          </div>
        )}
      </div>

      {/* Header */}
      <div className="text-center space-y-2 select-none mt-4">
        <h3 className="text-xs md:text-sm tracking-[0.3em] uppercase opacity-80 border-b border-[#D4AF37] pb-2 inline-block">
          WINTER LIMITED EDITION
        </h3>
        <h1 className="text-2xl md:text-5xl font-bold tracking-wider text-gold-gradient drop-shadow-lg">
          GRAND CHRISTMAS
        </h1>
        <p className="font-['Playfair_Display'] italic text-sm md:text-base opacity-90">
          Experience the Magic of Luxury
        </p>
      </div>

      {/* Footer / Controls */}
      <div className="flex flex-col items-center gap-6 pointer-events-auto">
        <div className="w-px h-16 bg-gradient-to-b from-transparent via-[#D4AF37] to-transparent opacity-50"></div>
        
        <button
          onClick={onToggle}
          className={`
            group relative px-10 py-3 
            border border-[#D4AF37] 
            overflow-hidden 
            transition-all duration-500 ease-out
            hover:shadow-[0_0_30px_rgba(212,175,55,0.4)]
          `}
        >
          {/* Button Background Transition */}
          <div className={`
            absolute inset-0 bg-gold-gradient opacity-0 transition-opacity duration-500
            ${!isFormed ? 'group-hover:opacity-20' : ''}
            ${isFormed ? 'opacity-100' : ''}
          `}></div>

          {/* Button Content */}
          <span className={`
            relative z-10 text-base tracking-[0.2em] font-bold uppercase transition-colors duration-300
            ${isFormed ? 'text-[#021a12]' : 'text-[#D4AF37]'}
          `}>
            {isFormed ? 'RELEASE (CHAOS)' : 'ASSEMBLE (FORM)'}
          </span>
        </button>
        
        <p className="text-xs uppercase tracking-widest opacity-60 mt-4">
          INTERACTIVE 3D • REACT 19 • R3F
        </p>
      </div>
    </div>
  );
};

export default Overlay;