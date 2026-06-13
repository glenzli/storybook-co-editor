console.log('Storybook Co-Editor Web Clipper initialized.');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractImages') {

        const imgs = Array.from(document.querySelectorAll('img'))
            .filter(img => {
                // Safely exclude common avatar classes without blocking small thumbnails
                if (img.alt && img.alt.toLowerCase().includes('avatar')) return false;
                if (img.className && img.className.toLowerCase().includes('avatar')) return false;
                return true;
            })
            .map(img => img.src);
            
        const html = document.body.innerHTML;
        
        // Aggressively match URLs directly from HTML to catch lazy-loaded, background, or stacked images
        const oaiMatches = html.match(/https:\/\/files\.oaiusercontent\.com\/[^"'\s\\]+/g) || [];
        const discordMatches = html.match(/https:\/\/cdn\.discordapp\.com\/attachments\/[^"'\s\\]+/g) || [];
        
        const allUrls = Array.from(new Set([...imgs, ...oaiMatches, ...discordMatches]));

        const validImages = allUrls
            .filter(src => {
                if (!src) return false;
                if (src.includes('oaiusercontent.com') || src.includes('discordapp.com') || src.includes('midjourney.com')) {
                    return true;
                }
                return src.startsWith('http');
            })
            .map(src => {
                let thumb = src;
                let original = src;
                
                // Gemini / Google Image upscaler (=s0 for original)
                if (original.includes('googleusercontent.com') || original.includes('ggpht.com')) {
                    if (original.match(/=[wsh]\d+[-a-zA-Z0-9]*/)) {
                        original = original.replace(/=[wsh]\d+[-a-zA-Z0-9]*/g, '=s0');
                    } else if (!original.includes('=')) {
                        original += '=s0';
                    }
                }
                
                // ChatGPT DALL-E Thumbnail Upscaler (if ChatGPT uses a small thumbnail suffix, though usually they serve full webp)
                if (original.includes('oaiusercontent.com') && original.includes('/thumb/')) {
                    original = original.replace('/thumb/', '/original/');
                }
                
                // For ChatGPT, the img src is usually the 1024x1024 WebP. If there's a download button or anchor, we could try to find it.
                // But generally, the src itself is the highest resolution served to the DOM.
                
                return { thumb, original, stable_id: getStableId(original) };
            })
            .filter(item => {
                // Ignore base64 images (usually avatars/placeholders)
                if (item.thumb.startsWith('data:image')) return false;
                
                // Ignore known avatar domains
                if (item.thumb.includes('lh3.googleusercontent.com')) return false;
                if (item.thumb.includes('gravatar.com')) return false;
                if (item.thumb.includes('avatars.githubusercontent.com')) return false;
                if (item.thumb.includes('auth0.com')) return false;
                
                return item.thumb.startsWith('http');
            });
        
        // Deduplicate by original URL
        const unique = Array.from(new Map(validImages.map(item => [item.original, item])).values());
        
        sendResponse({ images: unique });
        return true;
    }

    if (request.action === 'getBase64') {
        fetch(request.url)
            .then(r => r.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => sendResponse({ base64: reader.result });
                reader.readAsDataURL(blob);
            })
            .catch(e => {
                // Fallback: draw to canvas if fetch fails (e.g. CORS block but same-origin image)
                try {
                    const img = new Image();
                    img.crossOrigin = "anonymous";
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx?.drawImage(img, 0, 0);
                        sendResponse({ base64: canvas.toDataURL('image/png') });
                    };
                    img.onerror = () => sendResponse({ error: "Failed to load image for canvas." });
                    img.src = request.url;
                } catch (err: any) {
                    sendResponse({ error: err.message });
                }
            });
        return true;
    }
});

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

export function getStableId(urlStr: string): string {
    try {
        const url = new URL(urlStr);
        if (url.hostname.includes('oaiusercontent.com')) {
            const match = url.pathname.match(/\/file-([a-zA-Z0-9]+)/);
            if (match) return match[0];
        }
        if (url.hostname.includes('discordapp.com')) {
            return url.pathname; 
        }
        return url.origin + url.pathname;
    } catch(e) {
        return urlStr;
    }
}

// We will add a "Capture for Storybook" button overlay when hovering over images, only on supported domains.

if (isSupportedUrl(window.location.href)) {
    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.zIndex = '999999';
    overlay.style.display = 'none';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '4px';

    const btnStyle = `
        padding: 8px 12px;
        background-color: #18181b;
        color: #fafafa;
        border-radius: 6px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
        border: 1px solid #3f3f46;
        text-align: center;
    `;

    const btnAppend = document.createElement('div');
    btnAppend.style.cssText = btnStyle;
    btnAppend.innerText = '📸 发送至末尾';

    const btnInsert = document.createElement('div');
    btnInsert.style.cssText = btnStyle;
    btnInsert.innerText = '⬇️ 插到选中页后';

    overlay.appendChild(btnAppend);
    overlay.appendChild(btnInsert);
    document.body.appendChild(overlay);

    let currentTargetImage: HTMLImageElement | null = null;

    document.addEventListener('mouseover', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName.toLowerCase() === 'img') {
        const img = target as HTMLImageElement;
        if (img.width < 200 || img.height < 200) return;

        currentTargetImage = img;
        const rect = img.getBoundingClientRect();
        
        overlay.style.top = `${window.scrollY + rect.top + 10}px`;
        overlay.style.left = `${window.scrollX + rect.right - 140}px`;
        overlay.style.display = 'flex';
      }
    });

    document.addEventListener('mousemove', (e) => {
        if (!currentTargetImage) return;
        const target = e.target as HTMLElement;
        if (target !== currentTargetImage && !overlay.contains(target)) {
            overlay.style.display = 'none';
            currentTargetImage = null;
        }
    });

    const handleSend = async (insert_after_current: boolean, btn: HTMLElement) => {
        if (!currentTargetImage) return;
        
        const imageUrl = currentTargetImage.src;
        const originalText = btn.innerText;
        btn.innerText = '提取中...';
        
        try {
            const getBase64 = async (url: string) => {
                try {
                    const r = await fetch(url);
                    const blob = await r.blob();
                    return await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result as string);
                        reader.onerror = reject;
                        reader.readAsDataURL(blob);
                    });
                } catch (e) {
                    return await new Promise<string>((resolve, reject) => {
                        const img = new Image();
                        img.crossOrigin = "anonymous";
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            canvas.width = img.width;
                            canvas.height = img.height;
                            const ctx = canvas.getContext('2d');
                            ctx?.drawImage(img, 0, 0);
                            resolve(canvas.toDataURL('image/png'));
                        };
                        img.onerror = () => reject(new Error('Canvas fallback failed'));
                        img.src = url;
                    });
                }
            };

            const base64_data = await getBase64(imageUrl);
            btn.innerText = '发送中...';

            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'startBatch', payload: { total: 1 } }, resolve);
            });

            chrome.runtime.sendMessage(
                { action: 'saveImage', payload: { url: imageUrl, stable_id: getStableId(imageUrl), page: 1, base64_data, insert_after_current } },
                (response) => {
                    if (response && response.success) {
                        btn.innerText = '✅ 成功';
                    } else {
                        console.error('Error from background:', response?.error);
                        btn.innerText = '❌ 失败';
                    }
                    
                    setTimeout(() => {
                        btn.innerText = originalText;
                        overlay.style.display = 'none';
                    }, 2000);
                }
            );
        } catch (e) {
            console.error("Failed to extract image:", e);
            btn.innerText = '❌ 提取失败';
            setTimeout(() => {
                btn.innerText = originalText;
            }, 2000);
        }
    };

    btnAppend.addEventListener('click', () => handleSend(false, btnAppend));
    btnInsert.addEventListener('click', () => handleSend(true, btnInsert));
}
