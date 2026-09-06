import { useTranslation } from 'react-i18next';
import type { TextReadabilityMode } from '../../project/model';
import {
  STORY_TEXT_MAX_WIDTH_PERCENT,
  STORY_TEXT_MIN_WIDTH_PERCENT,
} from '../../utils/storyPageRenderer';

const MODES: TextReadabilityMode[] = ['none', 'outline', 'halo', 'wash', 'panel'];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function RangeSetting({
  label,
  value,
  minimum,
  maximum,
  onChange,
}: {
  label: string;
  value: number;
  minimum: number;
  maximum: number;
  onChange: (value: number) => void;
}) {
  const update = (rawValue: string) => {
    const parsed = Number(rawValue);
    if (Number.isFinite(parsed)) onChange(clamp(parsed, minimum, maximum));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label className="text-xs text-muted-foreground">{label}</label>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="number"
            min={minimum}
            max={maximum}
            value={Math.round(value)}
            onChange={event => update(event.target.value)}
            className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right font-mono text-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <span>%</span>
        </div>
      </div>
      <input
        type="range"
        min={minimum}
        max={maximum}
        step={1}
        value={value}
        onChange={event => update(event.target.value)}
        className="w-full cursor-pointer accent-primary"
      />
    </div>
  );
}

export function TextReadabilityControls({
  mode,
  strength,
  maxWidthPercent,
  pageSpecific,
  onModeChange,
  onStrengthChange,
  onMaxWidthChange,
}: {
  mode: TextReadabilityMode;
  strength: number;
  maxWidthPercent: number;
  pageSpecific: boolean;
  onModeChange: (mode: TextReadabilityMode) => void;
  onStrengthChange: (strength: number) => void;
  onMaxWidthChange: (maxWidthPercent: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-foreground">{t('rightSidebar.readability')}</span>
        {pageSpecific && (
          <span className="text-[10px] text-primary/70">{t('rightSidebar.currentPage')}</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t('rightSidebar.readability')}>
        {MODES.map(option => (
          <button
            key={option}
            type="button"
            aria-pressed={mode === option}
            onClick={() => onModeChange(option)}
            className={`rounded border px-2 py-1.5 text-xs transition-colors ${
              mode === option
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
            } ${option === 'panel' ? 'col-span-2' : ''}`}
          >
            {t(`rightSidebar.readabilityModes.${option}`)}
          </button>
        ))}
      </div>

      <p className="text-[10px] leading-4 text-muted-foreground">
        {t(`rightSidebar.readabilityHints.${mode}`)}
      </p>

      {mode !== 'none' && (
        <RangeSetting
          label={t('rightSidebar.readabilityStrength')}
          value={strength}
          minimum={20}
          maximum={100}
          onChange={onStrengthChange}
        />
      )}

      <RangeSetting
        label={t('rightSidebar.textWidth')}
        value={maxWidthPercent}
        minimum={STORY_TEXT_MIN_WIDTH_PERCENT}
        maximum={STORY_TEXT_MAX_WIDTH_PERCENT}
        onChange={onMaxWidthChange}
      />
      <p className="text-[10px] leading-4 text-muted-foreground">
        {t('rightSidebar.textWidthHint')}
      </p>
    </div>
  );
}
