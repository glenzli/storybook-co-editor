import { useEffect, useRef } from 'react';
import { renderPublicationPageToCanvas, type PublicationPage } from '../utils/publicationPageRenderer';

interface PublicationPagePreviewProps {
  page: PublicationPage;
}

export function PublicationPagePreview({ page }: PublicationPagePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const preview = renderPublicationPageToCanvas(page);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = page.width;
    canvas.height = page.height;
    ctx.drawImage(preview, 0, 0);
  }, [page]);

  return <canvas ref={canvasRef} className="h-full w-full bg-white" aria-label="版权页预览" />;
}
