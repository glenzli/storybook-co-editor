import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { renderPublicationPageToCanvas, type PublicationPage } from '../publication/copyrightPage';

interface PublicationPagePreviewProps {
  page: PublicationPage;
}

export function PublicationPagePreview({ page }: PublicationPagePreviewProps) {
  const { t } = useTranslation();
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

  return <canvas ref={canvasRef} className="h-full w-full bg-white" aria-label={t('publication.preview')} />;
}
