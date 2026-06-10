import React, { useEffect, useRef } from 'react';
import { applyProAdjustments, ProAdjustments } from '../utils/imageProcessor';

export interface ProImageProps extends React.ImgHTMLAttributes<HTMLCanvasElement> {
    src: string;
    adjustments?: ProAdjustments;
    onLoad?: () => void;
}

export const ProImage: React.FC<ProImageProps> = ({
    src, className, style, onLoad, adjustments
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const renderTimeoutRef = useRef<number | null>(null);

    const renderNow = (img: HTMLImageElement) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        if (canvas.width !== img.width || canvas.height !== img.height) {
            canvas.width = img.width;
            canvas.height = img.height;
        }

        ctx.drawImage(img, 0, 0);

        if (adjustments && (
            adjustments.brightness !== 0 || adjustments.exposure !== 0 || adjustments.highlights !== 0 || adjustments.shadows !== 0 || 
            adjustments.contrast !== 0 || adjustments.saturate !== 0 || adjustments.temperature !== 0 || adjustments.tint !== 0 ||
            (adjustments.selective_colors && adjustments.selective_colors.length > 0)
        )) {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            applyProAdjustments(imgData, adjustments);
            ctx.putImageData(imgData, 0, 0);
        }
    };

    useEffect(() => {
        if (!src) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            imgRef.current = img;
            renderNow(img);
            if (onLoad) onLoad();
        };
        img.onerror = () => {
            if (onLoad) onLoad();
        };
        
        img.src = src.startsWith('blank://') 
            ? "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" 
            : src;
        
        return () => {
            imgRef.current = null;
        };
    }, [src]);

    useEffect(() => {
        if (imgRef.current) {
            if (renderTimeoutRef.current) cancelAnimationFrame(renderTimeoutRef.current);
            renderTimeoutRef.current = requestAnimationFrame(() => {
                if (imgRef.current) {
                    renderNow(imgRef.current);
                }
            });
        }
    }, [adjustments]);

    return (
        <canvas 
            ref={canvasRef}
            className={className}
            style={style}
        />
    );
};
