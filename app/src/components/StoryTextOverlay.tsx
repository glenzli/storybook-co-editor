import { useEffect, useState, useId, type Ref } from 'react';
import { layoutStoryPageText, type StoryPage, type StoryTextLayer } from '../utils/storyPageRenderer';

interface StoryTextOverlayProps {
  layer: StoryTextLayer;
  pageWidth: number;
  pageHeight: number;
  scale?: number;
  textRef?: Ref<HTMLDivElement>;
  hideOnPdfExport?: boolean;
  interactive?: boolean;
}

/** Editor and print preview use the same frozen geometry as canvas/PDF/publication. */
export function StoryTextOverlay({ layer, pageWidth, pageHeight, scale = 1, textRef,
  hideOnPdfExport = false, interactive = false }: StoryTextOverlayProps) {
  const clipId = useId();
  const [, setFontRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) setFontRevision(v => v + 1); };
    document.fonts.ready.then(refresh);
    document.fonts.addEventListener('loadingdone', refresh);
    return () => { active = false; document.fonts.removeEventListener('loadingdone', refresh); };
  }, []);
  const context = document.createElement('canvas').getContext('2d');
  if (!context || !layer.text) return null;
  const page = { width: pageWidth, height: pageHeight, textLayers: [layer] } as StoryPage;
  const [layout] = layoutStoryPageText(context, page);
  const widths = layout.lines.map(line => {
    context.font = `${layout.fontWeight} ${layout.fontSize}px ${layout.fontFamilyStack}`;
    return context.measureText(line.text).width;
  });
  const width = Math.max(1, ...widths), height = layout.lines.length * layout.lineHeight;
  const x = layout.lines[0].x - width / 2;
  const y = layout.lines[0].y - layout.lineHeight;
  return <div ref={textRef} className={hideOnPdfExport ? 'hide-on-export' : undefined}
    style={{ position: 'absolute', left: x * scale, top: y * scale,
      width: width * scale, height: height * scale, pointerEvents: interactive ? 'auto' : 'none' }}>
    <svg role="img" aria-label={layer.text} width="100%" height="100%" viewBox={`${x} ${y} ${width} ${height}`}
      style={{ overflow: 'visible', display: 'block' }}>
      {layout.backdrop?.pigment && layout.backdrop.path ? <>
        <defs><clipPath id={clipId}><path d={layout.backdrop.path} /></clipPath></defs>
        {layout.backdrop.pigment.map((pass, index) => <g key={index} clipPath={pass.clip ? `url(#${clipId})` : undefined}>
          <path d={pass.path} opacity={pass.opacity} fill={pass.strokeWidth ? 'none' : layout.backdrop!.color}
            stroke={pass.strokeWidth ? layout.backdrop!.color : undefined} strokeWidth={pass.strokeWidth}
            style={{ filter: `blur(${pass.blur}px)` }} />
        </g>)}
      </> : layout.backdrop && (layout.backdrop.path
        ? <path d={layout.backdrop.path} fill={layout.backdrop.color} style={{ filter: `blur(${layout.backdrop.feather}px)` }} />
        : <rect x={layout.backdrop.x} y={layout.backdrop.y} width={layout.backdrop.width} height={layout.backdrop.height}
          rx={layout.backdrop.radius} fill={layout.backdrop.color} />)}
      <g fontFamily={layout.fontFamilyStack} fontWeight={layout.fontWeight} fontSize={layout.fontSize}
        textAnchor="middle" dominantBaseline="text-after-edge" strokeLinejoin="round">
        {layout.shadow && layout.lines.map((line, index) => <text key={`h${index}`} x={line.x} y={line.y}
          fill="none" stroke={layout.shadow!.color} strokeWidth={layout.shadow!.spread * 2}
          style={{ filter: `drop-shadow(0px 0px ${layout.shadow!.blur / 2}px ${layout.shadow!.color})` }}>{line.text}</text>)}
        {layout.lines.map((line, index) => <text key={index} x={line.x} y={line.y}
          fill={layout.color} stroke={layout.stroke?.color || 'none'} strokeWidth={layout.stroke?.width || 0}
          paintOrder="stroke fill" style={{ whiteSpace: 'pre' }}>{line.text}</text>)}
      </g>
    </svg>
  </div>;
}
