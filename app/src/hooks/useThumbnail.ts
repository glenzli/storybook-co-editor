import { useState, useEffect, useRef } from 'react';
import { applyProAdjustments, type ProAdjustments } from '../utils/imageProcessor';

const THUMB_MAX = 480; // px — max thumbnail width (2x for HiDPI)
const cache = new Map<string, string>(); // key → dataURL

/**
 * Generates a low-resolution, adjustment-applied thumbnail and caches the result.
 * Only re-processes when `src` or `adjustmentsKey` changes.
 */
export function useThumbnail(
    src: string,
    adjustments: ProAdjustments | undefined,
    scale: number,
    offsetX: number,
    offsetY: number,
    bgColor: string,
): string | null {
    const adjKey = JSON.stringify({ src, adjustments, scale, offsetX, offsetY, bgColor });
    const [thumb, setThumb] = useState<string | null>(() => cache.get(adjKey) ?? null);
    const cancelRef = useRef(false);

    useEffect(() => {
        // Skip if no src (means no adjustments needed)
        if (!src) { setThumb(null); return; }

        // Fast path: already cached
        const cached = cache.get(adjKey);
        if (cached) {
            setThumb(cached);
            return;
        }

        cancelRef.current = false;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            if (cancelRef.current) return;

            // Determine thumbnail dimensions
            const ratio = img.height / img.width;
            const tw = Math.min(THUMB_MAX, img.width);
            const th = Math.round(tw * ratio);

            // Create offscreen canvas at thumbnail resolution
            const canvas = document.createElement('canvas');
            canvas.width = tw;
            canvas.height = th;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return;

            // Fill background color first (prevents black borders on scaled-down images)
            if (bgColor && bgColor !== 'transparent') {
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, tw, th);
            }

            // Draw scaled/offset image
            ctx.save();
            ctx.translate(tw / 2, th / 2);
            ctx.scale(scale, scale);
            ctx.translate(-tw / 2 + (offsetX / 100) * tw, -th / 2 + (offsetY / 100) * th);
            ctx.drawImage(img, 0, 0, tw, th);
            ctx.restore();

            // Apply pixel adjustments if needed
            if (adjustments && (
                adjustments.brightness !== 0 || adjustments.exposure !== 0 ||
                adjustments.highlights !== 0 || adjustments.shadows !== 0 ||
                adjustments.contrast !== 0 || adjustments.saturate !== 0 ||
                adjustments.temperature !== 0 || adjustments.tint !== 0 ||
                (adjustments.remove_white_bg && adjustments.remove_white_bg > 0) ||
                (adjustments.selective_colors && adjustments.selective_colors.length > 0)
            )) {
                const imgData = ctx.getImageData(0, 0, tw, th);
                applyProAdjustments(imgData, adjustments);
                ctx.putImageData(imgData, 0, 0);
            }

            if (cancelRef.current) return;

            // Use PNG to preserve transparency (JPEG turns transparent pixels black)
            const dataUrl = canvas.toDataURL('image/png');
            cache.set(adjKey, dataUrl);

            // Evict old entries if cache gets too large (keep last 200)
            if (cache.size > 200) {
                const first = cache.keys().next().value;
                if (first) cache.delete(first);
            }

            setThumb(dataUrl);
        };

        img.src = src;

        return () => {
            cancelRef.current = true;
        };
    }, [adjKey]);

    return thumb;
}
