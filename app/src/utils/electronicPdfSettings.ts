import type { ElectronicPdfSettings } from '../project/model';

export type ElectronicPdfPreset = Exclude<NonNullable<ElectronicPdfSettings['preset']>, 'custom'>;

export interface ElectronicPdfExportSecrets {
  openPassword?: string;
}

export interface ResolvedElectronicPdfSettings {
  version: number;
  preset: NonNullable<ElectronicPdfSettings['preset']>;
  encryption_enabled: boolean;
  printing: NonNullable<ElectronicPdfSettings['printing']>;
  allow_copying: boolean;
  allow_modification: boolean;
  allow_annotations: boolean;
}

const PRESETS: Record<ElectronicPdfPreset, ResolvedElectronicPdfSettings> = {
  screen: {
    version: 1,
    preset: 'screen',
    encryption_enabled: true,
    printing: 'none',
    allow_copying: false,
    allow_modification: false,
    allow_annotations: true,
  },
  personal: {
    version: 1,
    preset: 'personal',
    encryption_enabled: true,
    printing: 'low_resolution',
    allow_copying: false,
    allow_modification: false,
    allow_annotations: true,
  },
  open: {
    version: 1,
    preset: 'open',
    encryption_enabled: false,
    printing: 'high_quality',
    allow_copying: true,
    allow_modification: false,
    allow_annotations: true,
  },
};

export function getElectronicPdfPreset(preset: ElectronicPdfPreset): ResolvedElectronicPdfSettings {
  return { ...PRESETS[preset] };
}

export function resolveElectronicPdfSettings(
  settings: ElectronicPdfSettings | undefined,
): ResolvedElectronicPdfSettings {
  const basePreset = settings?.preset === 'personal' || settings?.preset === 'open'
    ? settings.preset
    : 'screen';
  const base = PRESETS[basePreset];
  const printing = settings?.printing;

  return {
    version: 1,
    preset: settings?.preset || base.preset,
    encryption_enabled: settings?.encryption_enabled ?? base.encryption_enabled,
    printing: printing === 'low_resolution' || printing === 'high_quality' ? printing : 'none',
    allow_copying: settings?.allow_copying ?? base.allow_copying,
    allow_modification: settings?.allow_modification ?? base.allow_modification,
    allow_annotations: settings?.allow_annotations ?? base.allow_annotations,
  };
}

export function toPersistedElectronicPdfSettings(
  settings: ResolvedElectronicPdfSettings,
): ElectronicPdfSettings {
  return { ...settings, version: 1 };
}
