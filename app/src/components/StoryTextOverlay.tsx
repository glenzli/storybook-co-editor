import type { Ref } from 'react';
import {
  getBackdropColor,
  getStrokeColor,
  STORY_TEXT_BOTTOM,
  STORY_TEXT_HORIZONTAL_PADDING,
  STORY_TEXT_LINE_HEIGHT,
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
        paddingLeft: STORY_TEXT_HORIZONTAL_PADDING * scale,
        paddingRight: STORY_TEXT_HORIZONTAL_PADDING * scale,
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
    >
      <div
        ref={textRef}
        className="text-center whitespace-pre-wrap"
        style={{
          maxWidth: '100%',
          fontFamily: getFontFamilyStack(layer.fontFamily),
          fontSize,
          lineHeight: STORY_TEXT_LINE_HEIGHT,
          color: layer.color,
          pointerEvents: interactive ? 'auto' : 'none',
          transform: `translate(${layer.offsetX * scale}px, ${layer.offsetY * scale}px)`,
          ...(layer.hasBackdrop ? {
            background: getBackdropColor(layer.color),
            padding: `${fontSize * 0.2}px ${fontSize * 0.5}px`,
            borderRadius: `${fontSize * 0.3}px`,
          } : {}),
          ...(layer.hasShadow ? {
            WebkitTextStroke: `${fontSize * 0.04}px ${getStrokeColor(layer.color)}`,
            paintOrder: 'stroke fill',
          } : {}),
        }}
      >
        {layer.text}
      </div>
    </div>
  );
}
