import type { Ref } from 'react';
import {
  getStoryTextReadabilityPaint,
  STORY_TEXT_BOTTOM,
  STORY_TEXT_LINE_HEIGHT,
  STORY_TEXT_WASH_SVG_PATH,
  type StoryTextLayer,
} from '../utils/storyPageRenderer';
import { getFontFamilyStack } from '../utils/fonts';

interface StoryTextOverlayProps {
  layer: StoryTextLayer;
  scale?: number;
  textRef?: Ref<HTMLDivElement>;
  hideOnPdfExport?: boolean;
  interactive?: boolean;
}

export function StoryTextOverlay({
  layer,
  scale = 1,
  textRef,
  hideOnPdfExport = false,
  interactive = false,
}: StoryTextOverlayProps) {
  const fontSize = layer.fontSize * scale;
  const paint = getStoryTextReadabilityPaint(
    layer.readabilityMode,
    layer.color,
    fontSize,
    layer.readabilityStrength,
  );
  const backdrop = paint.backdrop;

  return (
    <div
      className={hideOnPdfExport ? 'hide-on-export' : undefined}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: STORY_TEXT_BOTTOM * scale,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      <div
        ref={textRef}
        className="text-center whitespace-pre-wrap"
        style={{
          position: 'relative',
          width: 'fit-content',
          maxWidth: `${layer.maxWidthPercent}%`,
          fontFamily: getFontFamilyStack(layer.fontFamily),
          fontWeight: layer.fontWeight,
          fontSize,
          lineHeight: STORY_TEXT_LINE_HEIGHT,
          color: layer.color,
          overflowWrap: 'anywhere',
          pointerEvents: interactive ? 'auto' : 'none',
          transform: `translate(${layer.offsetX * scale}px, ${layer.offsetY * scale}px)`,
          ...(paint.stroke ? {
            WebkitTextStroke: `${paint.stroke.width / 2}px ${paint.stroke.color}`,
            paintOrder: 'stroke fill',
          } : {}),
          ...(paint.shadow ? {
            textShadow: [
              `0 0 ${paint.shadow.blur * 0.45}px ${paint.shadow.color}`,
              `0 0 ${paint.shadow.blur}px ${paint.shadow.color}`,
            ].join(', '),
          } : {}),
        }}
      >
        {backdrop && (
          <svg
            aria-hidden="true"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              left: -backdrop.paddingX,
              top: -backdrop.paddingY,
              width: `calc(100% + ${backdrop.paddingX * 2}px)`,
              height: `calc(100% + ${backdrop.paddingY * 2}px)`,
              overflow: 'visible',
              filter: backdrop.kind === 'wash' ? `blur(${backdrop.feather}px)` : undefined,
              pointerEvents: 'none',
            }}
          >
            {backdrop.kind === 'wash' ? (
              <path d={STORY_TEXT_WASH_SVG_PATH} fill={backdrop.color} />
            ) : (
              <rect x="0" y="0" width="100" height="100" rx="10" fill={backdrop.color} />
            )}
          </svg>
        )}
        <span style={{ position: 'relative' }}>{layer.text}</span>
      </div>
    </div>
  );
}
