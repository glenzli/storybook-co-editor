import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { Image as ImageIcon, Send, Loader2, Maximize2, Trash2, CheckCircle2, RotateCcw, RefreshCw, XOctagon, CheckSquare, Square, ArrowLeftRight } from 'lucide-react';
import { createLogger } from './utils/logger';
import './index.css';

const logger = createLogger('SidePanel');

const SUPPORTED_DOMAINS = [
  'openai.com',
  'chatgpt.com',
  'oaiusercontent.com',
  'discord.com',
  'discordapp.com',
  'midjourney.com',
  'gemini.google.com'
];

function isSupportedUrl(url: string) {
  if (!url) return false;
  try {
    const urlObj = new URL(url);
    return SUPPORTED_DOMAINS.some(domain => urlObj.hostname.endsWith(domain));
  } catch (e) {
    return false;
  }
}

function SidePanel() {
  const [images, setImages] = useState<{thumb: string, original: string, stable_id: string, selected: boolean, syncStatus: 'NONE'|'IMPORTED'|'TRASHED'}[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isSupportedDomain, setIsSupportedDomain] = useState<boolean>(true);
  
  const isCancelledRef = useRef(false);

  const remoteLog = (level: string, message: string) => {
      logger.info(`[Remote] ${level}: ${message}`);
      try {
          chrome.runtime.sendMessage({ action: 'log', payload: { level, message } }).catch((e) => logger.error("remoteLog async error:", e));
      } catch (e) {
          logger.error("remoteLog sync error:", e);
      }
  };

  const scanImages = useCallback(async () => {
    setLoading(true);
    setImages([]);
    setStatus('Scanning current tab...');
    setProgress({ current: 0, total: 0 });
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.id) {
        setStatus('No active tab found.');
        setLoading(false);
        return;
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractImages' });
      
      let pState: any = null;
      try {
          const res = await fetch('http://127.0.0.1:14320/api/project/state');
          const data = await res.json();
          if (data.success && data.state) pState = data.state;
      } catch (e) {
          console.warn("Could not fetch project state", e);
      }

      if (response && response.images) {
        setImages(response.images.map((item: any) => {
            let syncStatus: 'NONE' | 'IMPORTED' | 'TRASHED' = 'NONE';
            if (pState && item.stable_id && pState.source_url_map) {
                const localFilename = pState.source_url_map[item.stable_id];
                if (localFilename) {
                    if (pState.visible_images?.includes(localFilename)) syncStatus = 'IMPORTED';
                    else if (pState.trashed_images?.includes(localFilename)) syncStatus = 'TRASHED';
                }
            }
            return { ...item, selected: syncStatus === 'NONE', syncStatus };
        }));
        setStatus(`Found ${response.images.length} images.`);
        remoteLog('info', `scanImages found ${response.images.length} images`);
      } else {
        setStatus('No images found on this page.');
        remoteLog('info', `scanImages found 0 images`);
      }
    } catch (e: any) {
      console.error(e);
      setStatus('Please refresh the target page first.');
      remoteLog('error', `scanImages error: ${e.message}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const checkTabAndScan = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url) {
          const supported = isSupportedUrl(tab.url);
          setIsSupportedDomain(supported);
          if (supported) {
            scanImages();
          } else {
            setImages([]);
            setStatus('');
          }
        } else {
            setIsSupportedDomain(false);
            setImages([]);
        }
      } catch(e) {
         console.error("Tab query failed", e);
      }
    };

    checkTabAndScan();

    const onActivated = () => {
      checkTabAndScan();
    };

    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => {
      if (changeInfo.status === 'complete' && tab.active) {
        checkTabAndScan();
      }
    };

    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [scanImages]);

  const toggleSelect = (idx: number) => {
    setImages(prev => prev.map((img, i) => i === idx ? { ...img, selected: !img.selected } : img));
  };

  const selectAll = () => setImages(prev => prev.map(img => img.syncStatus === 'NONE' ? { ...img, selected: true } : img));
  const deselectAll = () => setImages(prev => prev.map(img => img.syncStatus === 'NONE' ? { ...img, selected: false } : img));
  const invertSelection = () => setImages(prev => prev.map(img => img.syncStatus === 'NONE' ? { ...img, selected: !img.selected } : img));

  const selectableImages = images.filter(img => img.syncStatus === 'NONE');
  const hasImages = images.length > 0;
  const allSelected = selectableImages.length > 0 && selectableImages.every(img => img.selected);
  const noneSelected = selectableImages.length > 0 && selectableImages.every(img => !img.selected);

  const cancelBatch = async () => {
    isCancelledRef.current = true;
    setStatus('Cancelling...');
    await chrome.runtime.sendMessage({ action: 'cancelBatch' });
  };

  const sendToEditor = async () => {
    logger.info("sendToEditor triggered!");
    try {
        const selected = images.filter(img => img.selected);
        logger.debug("Selected images count:", selected.length);
        if (selected.length === 0) return;
        
        isCancelledRef.current = false;
        setLoading(true);
        setProgress({ current: 0, total: selected.length });
        setStatus(`Preparing to send ${selected.length} images...`);

        logger.debug("Querying active tab...");
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        remoteLog('info', `sendToEditor starting batch of ${selected.length} images`);
        
        try {
            await chrome.runtime.sendMessage({ action: 'startBatch', payload: { total: selected.length } });
            logger.debug("startBatch message resolved.");
        } catch (e) {
            logger.error("startBatch message rejected:", e);
        }

        let successCount = 0;
        for (let i = 0; i < selected.length; i++) {
          if (isCancelledRef.current) {
             logger.info("Batch cancelled during loop.");
             setStatus(`Cancelled. Sent ${successCount}/${selected.length} images.`);
             break;
          }

          try {
            setStatus(`Processing image ${i + 1}/${selected.length}...`);
            let payload: any = { page: i + 1, url: selected[i].original };
            
            if (tab && tab.id) {
                logger.debug(`Requesting Base64 for image ${i}...`);
                const b64res: any = await Promise.race([
                    chrome.tabs.sendMessage(tab.id, { action: 'getBase64', url: selected[i].original }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout extracting image')), 15000))
                ]);
                if (b64res && b64res.base64) {
                    logger.debug(`Base64 obtained for image ${i}`);
                    payload.base64_data = b64res.base64;
                } else if (b64res && b64res.error) {
                    logger.warn(`Base64 extraction error for image ${i}:`, b64res.error);
                }
            }

            if (isCancelledRef.current) break;

            logger.debug(`Sending saveImage to background for image ${i}...`);
            setStatus(`Sending image ${i + 1}/${selected.length} to backend...`);
            const res: any = await Promise.race([
                new Promise((resolve) => {
                  chrome.runtime.sendMessage({ action: 'saveImage', payload }, resolve);
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout backend save')), 15000))
            ]);

            logger.debug(`saveImage background response for image ${i}:`, res);
            if (res?.success) {
                successCount++;
            } else {
                remoteLog('error', `Backend save failed for image ${i}: ${res?.error || 'Unknown'}`);
            }
          } catch (e: any) {
            logger.error(`Failed to send image ${i}:`, e);
            remoteLog('error', `Exception sending image ${i}: ${e.message}`);
          }
          setProgress({ current: i + 1, total: selected.length });
        }

        if (!isCancelledRef.current) {
            logger.info("Batch loop finished.");
            setStatus(`Complete! Sent ${successCount}/${selected.length} images.`);
        }
        
        setLoading(false);
        setTimeout(() => {
            if (!isCancelledRef.current && successCount === selected.length) {
                deselectAll();
            }
            setProgress({ current: 0, total: 0 });
            setStatus('');
        }, 4000);
    } catch (criticalError) {
        logger.error("CRITICAL ERROR IN sendToEditor:", criticalError);
        setStatus("System error, check sidepanel console.");
        setLoading(false);
    }
  };

  if (!isSupportedDomain) {
    return (
      <div className="flex flex-col h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center mb-4">
          <ImageIcon size={32} className="text-zinc-400 dark:text-zinc-500" />
        </div>
        <h2 className="text-lg font-bold mb-2 text-zinc-700 dark:text-zinc-300">不支持的网页</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
          当前网页似乎不是 AI 绘图平台。<br/>
          请前往 ChatGPT, Midjourney, 或 Gemini 等支持的平台提取素材。
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <header className="flex flex-col z-10 flex-shrink-0">
        <div className="px-3 pt-3 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button onClick={selectAll} disabled={loading || !hasImages || allSelected} title="全选" className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed">
              <CheckSquare size={18} />
            </button>
            <button onClick={deselectAll} disabled={loading || !hasImages || noneSelected} title="全不选" className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed">
              <Square size={18} />
            </button>
            <button onClick={invertSelection} disabled={loading || !hasImages} title="反选" className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-600 dark:text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed">
              <ArrowLeftRight size={18} />
            </button>
          </div>
          <div className="flex items-center">
            <button 
                onClick={scanImages} 
                disabled={loading}
                className="p-1.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-colors text-zinc-600 dark:text-zinc-400 disabled:opacity-50"
                title="重新扫描页面图片"
            >
                <RefreshCw size={18} className={`${loading && progress.total === 0 ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {status && (
            <div className="px-4 pb-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {status}
            </div>
        )}
        
        {progress.total > 0 && (
          <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1 overflow-hidden">
            <div 
              className="bg-emerald-500 h-1 transition-all duration-300 ease-out" 
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            ></div>
          </div>
        )}
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {images.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {images.map((img, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                      if (loading) return;
                      if (img.syncStatus !== 'NONE') return;
                      toggleSelect(idx);
                  }}
                  className={`relative rounded-md overflow-hidden transition-all ${
                    img.selected ? 'border-2 border-emerald-500 shadow-md' : 'border-2 border-transparent'
                  } ${img.syncStatus !== 'NONE' ? 'opacity-30 cursor-not-allowed grayscale' : 'cursor-pointer hover:opacity-80'}`}
                >
                  <img src={img.thumb} className="w-full h-32 object-cover" title={`原图 URL:\n${img.original}`} />
                  {img.syncStatus === 'IMPORTED' && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <span className="bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1"><CheckCircle2 size={14}/> 已入库</span>
                    </div>
                  )}
                  {img.syncStatus === 'TRASHED' && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1"><Trash2 size={14}/> 已排除</span>
                    </div>
                  )}
                  {img.selected && img.syncStatus === 'NONE' && (
                    <div className="absolute top-1 right-1 text-white bg-emerald-500 rounded-full">
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                </div>
              ))}
            </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-500 text-center gap-4">
            <p>点击右上角按钮扫描当前网页的图片</p>
          </div>
        )}
      </main>

      {images.length > 0 && (
        <footer className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex-shrink-0 flex gap-2">
          {loading && progress.total > 0 ? (
            <button 
                onClick={cancelBatch}
                className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-md font-bold transition-colors flex justify-center items-center gap-2 shadow-md"
            >
                <XOctagon size={18} />
                停止发送
            </button>
          ) : (
            <button 
                onClick={sendToEditor}
                disabled={images.filter(i => i.selected).length === 0}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-bold transition-colors flex justify-center items-center gap-2 shadow-md"
            >
                <Send size={18} />
                发送 {images.filter(i => i.selected).length} 张至本地
            </button>
          )}
        </footer>
      )}
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<SidePanel />);
}
