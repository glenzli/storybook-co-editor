import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TextReadabilityControls } from './TextReadabilityControls';
import { effectsFromMode } from '../../text-design/effects';
import type { TextEffects } from '../../project/model';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../i18n', () => ({ default: { t: (key: string) => key } }));

const render = (effects?: TextEffects, textColor = '#000000') => renderToStaticMarkup(
  <TextReadabilityControls effects={effects} textColor={textColor} mode="wash" strength={55}
    maxWidthPercent={90} pageSpecific onEffectsChange={vi.fn()} onModeChange={vi.fn()}
    onStrengthChange={vi.fn()} onMaxWidthChange={vi.fn()} />,
);

describe('painted wash controls', () => {
  it('offers zero strength in both preset and combined controls with an accurate default swatch', () => {
    for (const effects of [undefined, effectsFromMode('wash', 0)]) {
      const markup = render(effects);
      const inputs = markup.match(/<input\b[^>]*aria-label="rightSidebar.readabilityStrength"[^>]*>/g)!;
      expect(inputs.length).toBeGreaterThanOrEqual(2);
      expect(inputs.every(input => input.includes('min="0"'))).toBe(true);
      expect(markup).toContain('type="color" value="#ffffff"');
      expect(markup).toMatch(/aria-label="textDesign.feather"[^>]*value="80"/);
      expect(markup).toContain('textDesign.resetEdges');
    }
    expect(render(undefined, '#ffffff')).toContain('type="color" value="#12202e"');
  });
  it('shows saved low strength, edge softness and custom tint without resetting them', () => {
    const markup = render({ ...effectsFromMode('wash', 5), feather: 55, color: '#f4e2d0' });
    expect(markup).toMatch(/aria-label="rightSidebar.readabilityStrength"[^>]*value="5"/);
    expect(markup).toMatch(/aria-label="textDesign.feather"[^>]*value="55"/);
    expect(markup).toContain('type="color" value="#f4e2d0"');
  });
});
