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
                
                return { thumb, original };
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

// We will add a "Capture for Storybook" button overlay when hovering over images.

const overlay = document.createElement('div');
overlay.style.position = 'absolute';
overlay.style.zIndex = '999999';
overlay.style.display = 'none';
overlay.style.padding = '8px 12px';
overlay.style.backgroundColor = '#18181b'; // zinc-900
overlay.style.color = '#fafafa'; // zinc-50
overlay.style.borderRadius = '6px';
overlay.style.cursor = 'pointer';
overlay.style.fontWeight = 'bold';
overlay.style.fontSize = '14px';
overlay.style.boxShadow = '0 4px 6px -1px rgb(0 0 0 / 0.1)';
overlay.innerText = '📸 发送至绘本';
document.body.appendChild(overlay);

let currentTargetImage: HTMLImageElement | null = null;

document.addEventListener('mouseover', (e) => {
  const target = e.target as HTMLElement;
  if (target.tagName.toLowerCase() === 'img') {
    const img = target as HTMLImageElement;
    // Basic filter: ignore tiny icons
    if (img.width < 200 || img.height < 200) return;

    currentTargetImage = img;
    const rect = img.getBoundingClientRect();
    
    // Position the overlay at the top right of the image
    overlay.style.top = `${window.scrollY + rect.top + 10}px`;
    overlay.style.left = `${window.scrollX + rect.right - 130}px`;
    overlay.style.display = 'block';
  }
});

// Hide overlay when moving mouse away from the image and the overlay itself
document.addEventListener('mousemove', (e) => {
    if (!currentTargetImage) return;
    const target = e.target as HTMLElement;
    if (target !== currentTargetImage && target !== overlay) {
        overlay.style.display = 'none';
        currentTargetImage = null;
    }
});

overlay.addEventListener('click', async () => {
    if (!currentTargetImage) return;
    
    const imageUrl = currentTargetImage.src;
    overlay.innerText = '发送中...';
    
    chrome.runtime.sendMessage(
        { action: 'saveImage', payload: { url: imageUrl, page: 1 } },
        (response) => {
            if (response && response.success) {
                overlay.innerText = '✅ 发送成功';
            } else {
                console.error('Error from background:', response?.error);
                overlay.innerText = '❌ 连接本地 App 失败';
            }
            
            setTimeout(() => {
                if (overlay.innerText.includes('成功') || overlay.innerText.includes('失败')) {
                    overlay.style.display = 'none';
                    overlay.innerText = '📸 发送至绘本';
                }
            }, 2000);
        }
    );
});
