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

    // ── Theme ──
    const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
    const t = () => isDark()
        ? { bg: 'rgba(24,24,27,0.92)', fg: '#fafafa', fgMuted: '#a1a1aa', border: 'rgba(63,63,70,0.6)', shadow: 'rgba(0,0,0,0.5)', sendBg: 'rgba(39,39,42,0.88)', refBg: 'rgba(100,130,168,0.75)', alignBg: 'rgba(168,120,90,0.75)', glow: 'rgba(100,130,168,0.4)', backdrop: 'blur(12px) saturate(1.6)' }
        : { bg: 'rgba(255,255,255,0.88)', fg: '#18181b', fgMuted: '#71717a', border: 'rgba(228,228,231,0.8)', shadow: 'rgba(0,0,0,0.1)', sendBg: 'rgba(39,39,42,0.85)', refBg: 'rgba(100,130,168,0.82)', alignBg: 'rgba(168,120,90,0.82)', glow: 'rgba(100,130,168,0.25)', backdrop: 'blur(12px) saturate(1.6)' };

    // ── State ──
    let referenceUrl: string | null = null;

    // ── Floating Reference Indicator (right edge) ──
    const refIndicator = document.createElement('div');
    refIndicator.style.cssText = `
        position: fixed; right: 16px; top: 50%; transform: translateY(-50%);
        z-index: 1000000; display: none; flex-direction: column; align-items: center; gap: 6px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    document.body.appendChild(refIndicator);

    function renderRefIndicator() {
        const theme = t();
        if (!referenceUrl) { refIndicator.style.display = 'none'; return; }
        refIndicator.style.display = 'flex';
        refIndicator.innerHTML = '';

        const label = document.createElement('div');
        label.style.cssText = `font-size:10px; font-weight:600; color:${theme.fgMuted}; letter-spacing:0.5px; text-transform:uppercase;`;
        label.innerText = '参考图';
        refIndicator.appendChild(label);

        const imgWrap = document.createElement('div');
        imgWrap.style.cssText = `
            position: relative; width: 80px; height: 80px; border-radius: 10px; overflow: hidden;
            border: 2px solid rgba(100,130,168,0.6);
            box-shadow: 0 0 20px ${theme.glow}, 0 4px 12px ${theme.shadow};
        `;
        const img = document.createElement('img');
        img.src = referenceUrl;
        img.style.cssText = 'width:100%; height:100%; object-fit:cover;';
        imgWrap.appendChild(img);

        const closeBtn = document.createElement('div');
        closeBtn.style.cssText = `
            position:absolute; top:2px; right:2px; width:18px; height:18px;
            background:rgba(0,0,0,0.6); color:#f87171; font-size:12px; line-height:18px;
            text-align:center; border-radius:50%; cursor:pointer; opacity:0; transition:opacity 0.15s;
        `;
        closeBtn.innerText = '✕';
        imgWrap.addEventListener('mouseover', () => closeBtn.style.opacity = '1');
        imgWrap.addEventListener('mouseout', () => closeBtn.style.opacity = '0');
        closeBtn.addEventListener('click', () => {
            referenceUrl = null;
            renderRefIndicator();
            updateOverlayButtons();
        });
        imgWrap.appendChild(closeBtn);
        refIndicator.appendChild(imgWrap);
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderRefIndicator);

    // ── Toast ──
    function showToast(msg: string, duration = 3000) {
        const theme = t();
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
            z-index:1000001; padding:10px 20px; border-radius:8px;
            background:${theme.bg}; color:${theme.fg}; border:1px solid ${theme.border};
            box-shadow:0 4px 16px ${theme.shadow}; backdrop-filter:${theme.backdrop};
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
            font-size:13px; font-weight:500; transition:opacity 0.3s;
        `;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, duration);
    }

    // ── Hover Overlay ──
    const overlay = document.createElement('div');
    overlay.style.cssText = `position:absolute; z-index:999999; display:none; flex-direction:column; gap:4px;`;

    const makeBtnStyle = (bg: string, backdrop: string) => `
        padding: 6px 14px; background:${bg}; color:#fff;
        border-radius: 8px; cursor: pointer; font-weight: 600;
        font-size: 12px; border: 1px solid rgba(255,255,255,0.18);
        text-align: center; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        backdrop-filter: ${backdrop}; -webkit-backdrop-filter: ${backdrop};
        transition: transform 0.12s, box-shadow 0.12s;
        letter-spacing: 0.3px;
    `;

    const btnSend = document.createElement('div');
    const btnAction = document.createElement('div');

    function applyOverlayTheme() {
        const theme = t();
        btnSend.style.cssText = makeBtnStyle(theme.sendBg, theme.backdrop);
        btnAction.style.cssText = makeBtnStyle(referenceUrl ? theme.alignBg : theme.refBg, theme.backdrop);
    }

    function updateOverlayButtons() {
        btnAction.innerText = referenceUrl ? '✨ 对齐样式' : '🎯 参考';
        applyOverlayTheme();
    }

    function getSendResultFeedback(response: { success?: boolean; status?: string; error?: string } | undefined) {
        if (!response?.success) {
            return {
                buttonText: '❌ 失败',
                toastText: response?.error ? `发送失败：${response.error}` : '发送失败，请确认桌面端已打开'
            };
        }

        if (response.status === 'trashed') {
            return {
                buttonText: '🗑️ 在回收站',
                toastText: '这张图片已在 app 回收站中，请先在 app 里恢复或清理后再发送'
            };
        }

        if (response.status === 'duplicate') {
            return {
                buttonText: '↩️ 已存在',
                toastText: '这张图片已经在当前项目中'
            };
        }

        return {
            buttonText: '✅ 成功',
            toastText: '图片已发送到 Storybook Co-Editor'
        };
    }

    btnSend.innerText = '📸 发送';
    updateOverlayButtons();

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyOverlayTheme);

    [btnSend, btnAction].forEach(btn => {
        btn.addEventListener('mouseover', () => { btn.style.transform = 'scale(1.06)'; btn.style.boxShadow = '0 4px 14px rgba(0,0,0,0.35)'; });
        btn.addEventListener('mouseout', () => { btn.style.transform = 'scale(1)'; btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'; });
    });

    overlay.appendChild(btnSend);
    overlay.appendChild(btnAction);
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
            overlay.style.left = `${window.scrollX + rect.right - 100}px`;
            overlay.style.display = 'flex';
            updateOverlayButtons();
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

    // ── Helper: fetch image as blob ──
    const fetchImageBlob = async (url: string): Promise<Blob> => {
        try {
            const r = await fetch(url);
            return await r.blob();
        } catch {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const c = document.createElement('canvas');
                    c.width = img.width; c.height = img.height;
                    c.getContext('2d')?.drawImage(img, 0, 0);
                    c.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
                };
                img.onerror = () => reject(new Error('Image load failed'));
                img.src = url;
            });
        }
    };

    const blobToBase64 = (blob: Blob): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

    // ── Set Reference ──
    const handleSetReference = () => {
        if (!currentTargetImage) return;
        referenceUrl = currentTargetImage.src;
        renderRefIndicator();
        updateOverlayButtons();
        btnAction.innerText = '✅ 已设为参考';
        setTimeout(() => updateOverlayButtons(), 1000);
    };

    // ── Align Style Prompt ──
    const STYLE_PROMPT = `请仔细对比以下两张图片。

图1是【参考图 / 风格基准】，图2是【目标图 / 需要调整的图】。

请执行以下任务：
1. 分析图2相对于图1，在以下维度上存在哪些具体差异：画风笔触、色调色温、光影氛围、线条质感、材质纹理、整体视觉风格
2. 基于你的分析结果，编写一段精确的图像生成 Prompt，要求：
   - 完整保留图2的构图、主体内容和叙事场景
   - 将图2的视觉风格完全对齐到图1
   - Prompt 需要足够具体和详细，可直接用于图像生成
3. 使用你编写的 Prompt，直接重新生成图2`;

    const handleAlignStyle = async () => {
        if (!currentTargetImage || !referenceUrl) return;
        const targetUrl = currentTargetImage.src;
        btnAction.innerText = '准备中...';

        try {
            const [refBlob, targetBlob] = await Promise.all([
                fetchImageBlob(referenceUrl),
                fetchImageBlob(targetUrl),
            ]);

            // Try to find chat input
            const chatInput = document.querySelector<HTMLElement>(
                'div#prompt-textarea, div[contenteditable="true"].ProseMirror, ' +
                'div.ql-editor, rich-textarea .ql-editor, div[contenteditable="true"][aria-label], ' +
                'textarea[data-id="root"]'
            );

            if (chatInput) {
                // Insert prompt text
                if (chatInput.tagName === 'TEXTAREA') {
                    (chatInput as HTMLTextAreaElement).value = STYLE_PROMPT;
                    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    chatInput.focus();
                    const p = document.createElement('p');
                    p.textContent = STYLE_PROMPT;
                    chatInput.innerHTML = '';
                    chatInput.appendChild(p);
                    chatInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Try to paste images via file input
                const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][accept*="image"]');
                if (fileInput) {
                    const refFile = new File([refBlob], 'reference.png', { type: refBlob.type || 'image/png' });
                    const targetFile = new File([targetBlob], 'target.png', { type: targetBlob.type || 'image/png' });
                    const dt = new DataTransfer();
                    dt.items.add(refFile);
                    dt.items.add(targetFile);
                    fileInput.files = dt.files;
                    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
                    btnAction.innerText = '✅ 已填入';
                    showToast('✅ Prompt 和图片已填入对话框，请检查后发送');
                } else {
                    btnAction.innerText = '✅ 文字已填入';
                    showToast('📝 Prompt 已填入，请手动上传两张图片（先参考图，后目标图）');
                }
            } else {
                // Fallback: copy prompt to clipboard
                try { await navigator.clipboard.writeText(STYLE_PROMPT); } catch {}
                btnAction.innerText = '📋 已复制';
                showToast('📋 Prompt 已复制到剪切板，请粘贴到对话框并上传两张图片');
            }
        } catch (e) {
            console.error('Align style failed:', e);
            btnAction.innerText = '❌ 失败';
            showToast('操作失败，请重试');
        }

        setTimeout(() => updateOverlayButtons(), 2500);
    };

    btnAction.addEventListener('click', () => {
        if (referenceUrl) handleAlignStyle();
        else handleSetReference();
    });

    // ── Send to Storybook ──
    btnSend.addEventListener('click', async () => {
        if (!currentTargetImage) return;
        const imageUrl = currentTargetImage.src;
        btnSend.innerText = '提取中...';

        try {
            const base64_data = await blobToBase64(await fetchImageBlob(imageUrl));
            btnSend.innerText = '发送中...';

            await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'startBatch', payload: { total: 1 } }, resolve);
            });

            chrome.runtime.sendMessage(
                { action: 'saveImage', payload: { url: imageUrl, stable_id: getStableId(imageUrl), page: 1, base64_data, insert_after_current: true } },
                (response) => {
                    const runtimeError = chrome.runtime.lastError?.message;
                    const effectiveResponse = runtimeError ? { success: false, error: runtimeError } : response;
                    const feedback = getSendResultFeedback(effectiveResponse);
                    btnSend.innerText = feedback.buttonText;
                    showToast(feedback.toastText);
                    if (!effectiveResponse?.success) console.error('Error:', effectiveResponse?.error);
                    setTimeout(() => { btnSend.innerText = '📸 发送'; overlay.style.display = 'none'; }, 2000);
                }
            );
        } catch (e) {
            console.error('Failed to extract image:', e);
            btnSend.innerText = '❌ 失败';
            setTimeout(() => { btnSend.innerText = '📸 发送'; }, 2000);
        }
    });
}
