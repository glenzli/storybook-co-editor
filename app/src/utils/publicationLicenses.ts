import type { PublicationMetadata } from '../ProjectContext';

export type PublicationLicensePresetId =
  | 'none'
  | 'all-rights-reserved'
  | 'cc-by-nc-nd-4.0'
  | 'cc-by-nc-sa-4.0'
  | 'cc-by-4.0'
  | 'cc-by-sa-4.0'
  | 'cc-by-nc-4.0'
  | 'cc-by-nd-4.0'
  | 'cc0-1.0'
  | 'custom';

export const PUBLICATION_LICENSE_TRANSLATION_KEYS: Record<PublicationLicensePresetId, string> = {
  none: 'none',
  'all-rights-reserved': 'allRightsReserved',
  'cc-by-nc-nd-4.0': 'ccByNcNd',
  'cc-by-nc-sa-4.0': 'ccByNcSa',
  'cc-by-4.0': 'ccBy',
  'cc-by-sa-4.0': 'ccBySa',
  'cc-by-nc-4.0': 'ccByNc',
  'cc-by-nd-4.0': 'ccByNd',
  'cc0-1.0': 'cc0',
  custom: 'custom',
};

export interface PublicationLicensePreset {
  id: PublicationLicensePresetId;
  label: string;
  name: string;
  url: string;
  summary: string;
  kind: 'none' | 'rights-reserved' | 'creative-commons' | 'public-domain' | 'custom';
}

export const PUBLICATION_LICENSE_PRESETS: readonly PublicationLicensePreset[] = [
  {
    id: 'none',
    label: '未选择',
    name: '',
    url: '',
    summary: '不在作品元数据或版权页中写入许可信息。',
    kind: 'none',
  },
  {
    id: 'all-rights-reserved',
    label: '保留所有权利',
    name: 'All rights reserved',
    url: '',
    summary: '不主动授予复制、改编或再发布作品的权利。',
    kind: 'rights-reserved',
  },
  {
    id: 'cc-by-nc-nd-4.0',
    label: 'CC BY-NC-ND 4.0',
    name: 'CC BY-NC-ND 4.0',
    url: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    summary: '允许署名、非商用地分享原作，不允许发布改编版本。',
    kind: 'creative-commons',
  },
  {
    id: 'cc-by-nc-sa-4.0',
    label: 'CC BY-NC-SA 4.0',
    name: 'CC BY-NC-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    summary: '允许署名、非商用地分享和改编，改编作品须使用相同许可。',
    kind: 'creative-commons',
  },
  {
    id: 'cc-by-4.0',
    label: 'CC BY 4.0',
    name: 'CC BY 4.0',
    url: 'https://creativecommons.org/licenses/by/4.0/',
    summary: '允许署名后分享和改编，包括商业使用。',
    kind: 'creative-commons',
  },
  {
    id: 'cc-by-sa-4.0',
    label: 'CC BY-SA 4.0',
    name: 'CC BY-SA 4.0',
    url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    summary: '允许署名后分享和改编，包括商业使用；改编作品须使用相同许可。',
    kind: 'creative-commons',
  },
  {
    id: 'cc-by-nc-4.0',
    label: 'CC BY-NC 4.0',
    name: 'CC BY-NC 4.0',
    url: 'https://creativecommons.org/licenses/by-nc/4.0/',
    summary: '允许署名、非商用地分享和改编。',
    kind: 'creative-commons',
  },
  {
    id: 'cc-by-nd-4.0',
    label: 'CC BY-ND 4.0',
    name: 'CC BY-ND 4.0',
    url: 'https://creativecommons.org/licenses/by-nd/4.0/',
    summary: '允许署名后分享原作，包括商业使用，不允许发布改编版本。',
    kind: 'creative-commons',
  },
  {
    id: 'cc0-1.0',
    label: 'CC0 1.0 公共领域贡献',
    name: 'CC0 1.0 Universal',
    url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    summary: '在法律允许的范围内放弃作品相关权利，供任何人自由使用。',
    kind: 'public-domain',
  },
  {
    id: 'custom',
    label: '自定义许可',
    name: '',
    url: '',
    summary: '填写自定义许可名称和许可条款或权利声明地址。',
    kind: 'custom',
  },
] as const;

const PRESET_BY_ID = new Map(
  PUBLICATION_LICENSE_PRESETS.map(preset => [preset.id, preset]),
);

function normalizeUrl(value: string | undefined): string {
  return value?.trim().replace(/\/+$/, '').toLowerCase() || '';
}

export function getPublicationLicensePreset(
  id: PublicationLicensePresetId,
): PublicationLicensePreset {
  return PRESET_BY_ID.get(id) ?? PRESET_BY_ID.get('custom')!;
}

export function resolvePublicationLicensePreset(
  licenseName: string | undefined,
  licenseUrl: string | undefined,
): PublicationLicensePreset {
  const name = licenseName?.trim() || '';
  const url = normalizeUrl(licenseUrl);

  if (!name && !url) return getPublicationLicensePreset('none');

  const urlMatch = PUBLICATION_LICENSE_PRESETS.find(
    preset => preset.url && normalizeUrl(preset.url) === url,
  );
  if (urlMatch) return urlMatch;

  if (!url && /^(all rights reserved|保留所有权利)$/i.test(name)) {
    return getPublicationLicensePreset('all-rights-reserved');
  }

  return getPublicationLicensePreset('custom');
}

export function resolveProjectPublicationLicense(
  metadata: PublicationMetadata | undefined,
): PublicationLicensePreset {
  return resolvePublicationLicensePreset(metadata?.license_name, metadata?.license_url);
}

export function isOpenPublicationLicense(
  preset: PublicationLicensePreset,
): boolean {
  return preset.kind === 'creative-commons' || preset.kind === 'public-domain';
}
