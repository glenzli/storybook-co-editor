import type { ProjectState, PublicationContributor, PublicationIdentifier } from '../project/model';

export const PUBLICATION_FORMAT = 'storybook-publication';
export const PUBLICATION_VERSION = 1;

export const PUBLICATION_FONT_REGISTRY = {
  id: 'glenzli-books-webfonts',
  version: '1',
  compatibility: 'storybook-co-editor-fonts-v1',
} as const;

export type PublicationReadingDirection = 'ltr' | 'rtl';

export interface PublishedPublication {
  id: string;
  title: string;
  contributors: PublicationContributor[];
  language: string;
  readingDirection: PublicationReadingDirection;
  description: string | null;
  keywords: string[];
  publisher: string | null;
  publicationDate: string | null;
  edition: string | null;
  copyrightHolder: string | null;
  copyrightYear: string | null;
  copyrightNotice: string | null;
  license: { name: string | null; url: string | null };
  identifiers: PublicationIdentifier[];
}

export interface PublishedTextLine {
  text: string;
  x: number;
  y: number;
}

export interface PublishedTextLayer {
  id: 'main' | 'author';
  text: string;
  lines: PublishedTextLine[];
  position: {
    x: number;
    y: number;
    maxWidth: number;
    anchor: 'center-bottom';
  };
  style: {
    font: string;
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    color: string;
    align: 'center';
    strokeColor: string | null;
    strokeWidth: number;
    shadow: null;
    backdropColor: string | null;
    backdropX: number | null;
    backdropY: number | null;
    backdropWidth: number | null;
    backdropHeight: number | null;
    backdropPaddingX: number;
    backdropPaddingY: number;
    backdropRadius: number;
  };
}

export interface PublishedPage {
  id: string;
  order: number;
  role: 'cover' | 'title' | 'body';
  image: {
    src: string;
    width: number;
    height: number;
    alt: string | null;
    mimeType: 'image/webp';
    bytes: number;
    sha256: string;
  };
  textLayers: PublishedTextLayer[];
}

export interface PublishedResource {
  path: string;
  mimeType: 'image/webp';
  bytes: number;
  sha256: string;
}

export interface PublicationManifestV1 {
  format: typeof PUBLICATION_FORMAT;
  formatVersion: typeof PUBLICATION_VERSION;
  createdAt: string;
  publication: PublishedPublication;
  canvas: { width: number; height: number };
  fontPack: typeof PUBLICATION_FONT_REGISTRY;
  pages: PublishedPage[];
  resources: PublishedResource[];
  integrity: {
    algorithm: 'sha256';
    publicationSha256: string;
  };
}

export interface PublicationManifestInput {
  projectState: ProjectState;
  createdAt: string;
  pages: PublishedPage[];
  resources: PublishedResource[];
}

function trimmed(value: string | undefined): string {
  return value?.trim() || '';
}

function nullable(value: string | undefined): string | null {
  return trimmed(value) || null;
}

export function getPublicationReadingDirection(language: string): PublicationReadingDirection {
  const primary = language.trim().toLowerCase().split(/[-_]/)[0];
  return ['ar', 'fa', 'he', 'ur'].includes(primary) ? 'rtl' : 'ltr';
}

export function getPublishedFontId(fontFamily: string): string {
  const aliases: Record<string, string> = {
    serif: 'noto-serif-sc',
    sans: 'noto-sans-sc',
    'LXGW WenKai': 'lxgw-wenkai',
    'Smiley Sans': 'smiley-sans',
    'ZCOOL QingKe HuangYou': 'zcool-qingke-huangyou',
    'ZCOOL XiaoWei': 'zcool-xiaowei',
    'ZCOOL KuaiLe': 'zcool-kuaile',
    'Noto Serif SC': 'noto-serif-sc',
    'Noto Sans SC': 'noto-sans-sc',
  };
  return aliases[fontFamily] || 'noto-sans-sc';
}

function projectPublishedPublication(projectState: ProjectState): Omit<PublishedPublication, 'id'> {
  const metadata = projectState.publication_metadata;
  const language = trimmed(metadata?.language) || 'und';
  return {
    title: trimmed(metadata?.title) || projectState.project_name.trim() || 'Untitled',
    contributors: metadata?.contributors
      ?.map(contributor => ({ ...contributor, name: contributor.name.trim() }))
      .filter(contributor => contributor.name) ?? [],
    language,
    readingDirection: getPublicationReadingDirection(language),
    description: nullable(metadata?.description),
    keywords: metadata?.keywords?.map(keyword => keyword.trim()).filter(Boolean) ?? [],
    publisher: nullable(metadata?.publisher),
    publicationDate: nullable(metadata?.publication_date),
    edition: null,
    copyrightHolder: nullable(metadata?.copyright_holder),
    copyrightYear: nullable(metadata?.copyright_year),
    copyrightNotice: nullable(metadata?.copyright_notice),
    license: {
      name: nullable(metadata?.license_name),
      url: nullable(metadata?.license_url),
    },
    identifiers: metadata?.identifiers
      ?.map(identifier => ({ ...identifier, value: identifier.value.trim() }))
      .filter(identifier => identifier.value) ?? [],
  };
}

export function isSafePublicationPath(path: string): boolean {
  return path.length > 0
    && !path.startsWith('/')
    && !path.includes('\\')
    && path.split('/').every(segment => segment.length > 0 && segment !== '.' && segment !== '..');
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(',')}}`;
}

export async function createPublishedPageId(sourceKey: string, occurrence = 0): Promise<string> {
  return `page-${(await sha256Hex(`${sourceKey}\n${occurrence}`)).slice(0, 20)}`;
}

export async function buildPublicationManifest(
  input: PublicationManifestInput,
): Promise<PublicationManifestV1> {
  if (input.pages.length !== input.resources.length) {
    throw new Error('PUBLICATION_RESOURCE_COUNT_MISMATCH');
  }
  if (input.resources.some(resource => !isSafePublicationPath(resource.path))) {
    throw new Error('PUBLICATION_UNSAFE_RESOURCE_PATH');
  }

  const publicationWithoutId = projectPublishedPublication(input.projectState);
  const preferredIdentifier = publicationWithoutId.identifiers[0];
  const publicationIdSeed = preferredIdentifier
    ? `${preferredIdentifier.scheme}:${preferredIdentifier.value}`
    : JSON.stringify({
        title: publicationWithoutId.title,
        contributors: publicationWithoutId.contributors,
      });
  const publication: PublishedPublication = {
    id: `publication-${(await sha256Hex(publicationIdSeed)).slice(0, 20)}`,
    ...publicationWithoutId,
  };
  const base = {
    format: PUBLICATION_FORMAT,
    formatVersion: PUBLICATION_VERSION,
    createdAt: input.createdAt,
    publication,
    canvas: {
      width: input.projectState.canvas_width || 1024,
      height: input.projectState.canvas_height || 1024,
    },
    fontPack: PUBLICATION_FONT_REGISTRY,
    pages: input.pages,
    resources: input.resources,
  } satisfies Omit<PublicationManifestV1, 'integrity'>;
  const publicationSha256 = await sha256Hex(canonicalJson(base));
  return {
    ...base,
    integrity: { algorithm: 'sha256', publicationSha256 },
  };
}
