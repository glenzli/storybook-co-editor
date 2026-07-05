import React, { useCallback, useEffect, useRef } from 'react';
import { applyProAdjustments } from '../utils/imageProcessor';
import type { ProAdjustments } from '../utils/imageProcessor';

export interface ProImageProps extends Omit<React.CanvasHTMLAttributes<HTMLCanvasElement>, 'onLoad'> {
    src: string;
    adjustments?: ProAdjustments;
    onLoad?: (img: HTMLImageElement) => void;
}

export const ProImage: React.FC<ProImageProps> = ({
    src, className, style, onLoad, adjustments
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const renderTimeoutRef = useRef<number | null>(null);
    const onLoadRef = useRef(onLoad);
    const adjustmentsRef = useRef(adjustments);

    useEffect(() => {
        onLoadRef.current = onLoad;
    }, [onLoad]);

    useEffect(() => {
        adjustmentsRef.current = adjustments;
    }, [adjustments]);

    const renderNow = useCallback((img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        if (canvas.width !== img.width || canvas.height !== img.height) {
            canvas.width = img.width;
            canvas.height = img.height;
        }

        ctx.drawImage(img, 0, 0);

        const activeAdjustments = adjustmentsRef.current;
        if (activeAdjustments && (
            activeAdjustments.brightness !== 0 || activeAdjustments.exposure !== 0 || activeAdjustments.highlights !== 0 || activeAdjustments.shadows !== 0 ||
            activeAdjustments.contrast !== 0 || activeAdjustments.saturate !== 0 || activeAdjustments.temperature !== 0 || activeAdjustments.tint !== 0 ||
            (activeAdjustments.remove_white_bg && activeAdjustments.remove_white_bg > 0) ||
            (activeAdjustments.selective_colors && activeAdjustments.selective_colors.length > 0)
        )) {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            applyProAdjustments(imgData, activeAdjustments);
            ctx.putImageData(imgData, 0, 0);
        }
    }, []);

    useEffect(() => {
        if (!src) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            renderNow(img);
            onLoadRef.current?.(img);
        };
        img.onerror = () => {
            onLoadRef.current?.(img);
        };
        
        img.src = src.startsWith('blank://') 
            ? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" 
            : src;
        
        return () => {
            imgRef.current = null;
        };
    }, [src, renderNow]);

    const adjString = JSON.stringify(adjustments || {});
    useEffect(() => {
        if (imgRef.current) {
            if (renderTimeoutRef.current) cancelAnimationFrame(renderTimeoutRef.current);
            renderTimeoutRef.current = requestAnimationFrame(() => {
                if (imgRef.current) {
                    renderNow(imgRef.current);
                }
            });
        }
    }, [adjString, renderNow]);

    return (
        <canvas 
            ref={canvasRef}
            className={className}
            style={style}
        />
    );
};
