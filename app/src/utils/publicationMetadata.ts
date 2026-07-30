import type { ProjectState, PublicationMetadata } from '../project/model';
import type { jsPDF } from 'jspdf';
import { parseStoryScript } from '../story/script';

const METADATA_TEXT_FIELDS: Array<keyof PublicationMetadata> = [
  'title',
  'language',
  'description',
  'publisher',
  'publication_date',
  'copyright_holder',
  'copyright_year',
  'copyright_notice',
  'license_name',
  'license_url',
];

function trimmed(value: string | undefined): string {
  return value?.trim() || '';
}

export function hasPublicationMetadata(metadata: PublicationMetadata | undefined): boolean {
  if (!metadata) return false;
  if (METADATA_TEXT_FIELDS.some(field => trimmed(metadata[field] as string | undefined))) return true;
  if (metadata.contributors?.some(contributor => trimmed(contributor.name))) return true;
  if (metadata.keywords?.some(keyword => trimmed(keyword))) return true;
  return Boolean(metadata.identifiers?.some(identifier => trimmed(identifier.value)));
}

export function createPublicationMetadataDraft(projectState: ProjectState): PublicationMetadata {
  const existing = projectState.publication_metadata;
  const parsed = parseStoryScript(projectState.global_script || '');
  const coverTitle = parsed.pageText.get(0)?.split('\n').find(line => line.trim())?.trim();

  return {
    version: 1,
    title: existing?.title ?? coverTitle ?? (projectState.project_name === 'Untitled' ? '' : projectState.project_name),
    contributors: existing?.contributors?.map(contributor => ({ ...contributor }))
      ?? (parsed.author ? [{ role: 'author', name: parsed.author }] : []),
    language: existing?.language ?? 'zh-CN',
    description: existing?.description ?? '',
    keywords: existing?.keywords ? [...existing.keywords] : [],
    publisher: existing?.publisher ?? '',
    publication_date: existing?.publication_date ?? '',
    copyright_holder: existing?.copyright_holder ?? '',
    copyright_year: existing?.copyright_year ?? '',
    copyright_notice: existing?.copyright_notice ?? '',
    license_name: existing?.license_name ?? '',
    license_url: existing?.license_url ?? '',
    identifiers: existing?.identifiers?.map(identifier => ({ ...identifier })) ?? [],
    copyright_page_mode: existing?.copyright_page_mode ?? 'electronic',
  };
}

export function normalizePublicationMetadata(metadata: PublicationMetadata): PublicationMetadata | undefined {
  const copyrightPageMode = metadata.copyright_page_mode;
  const normalized: PublicationMetadata = {
    version: 1,
    title: trimmed(metadata.title) || undefined,
    contributors: metadata.contributors
      ?.map(contributor => ({ ...contributor, name: trimmed(contributor.name) }))
      .filter(contributor => contributor.name),
    language: trimmed(metadata.language) || undefined,
    description: trimmed(metadata.description) || undefined,
    keywords: metadata.keywords?.map(trimmed).filter(Boolean),
    publisher: trimmed(metadata.publisher) || undefined,
    publication_date: trimmed(metadata.publication_date) || undefined,
    copyright_holder: trimmed(metadata.copyright_holder) || undefined,
    copyright_year: trimmed(metadata.copyright_year) || undefined,
    copyright_notice: trimmed(metadata.copyright_notice) || undefined,
    license_name: trimmed(metadata.license_name) || undefined,
    license_url: trimmed(metadata.license_url) || undefined,
    identifiers: metadata.identifiers
      ?.map(identifier => ({ ...identifier, value: trimmed(identifier.value) }))
      .filter(identifier => identifier.value),
    copyright_page_mode: copyrightPageMode === 'none' || copyrightPageMode === 'all'
      ? copyrightPageMode
      : 'electronic',
  };

  return hasPublicationMetadata(normalized) ? normalized : undefined;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function rdfAlt(tag: string, value: string): string {
  return value ? `<${tag}><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(value)}</rdf:li></rdf:Alt></${tag}>` : '';
}

function rdfBag(tag: string, values: string[]): string {
  const items = values.filter(Boolean);
  return items.length > 0
    ? `<${tag}><rdf:Bag>${items.map(value => `<rdf:li>${escapeXml(value)}</rdf:li>`).join('')}</rdf:Bag></${tag}>`
    : '';
}

function rdfSeq(tag: string, values: string[]): string {
  const items = values.filter(Boolean);
  return items.length > 0
    ? `<${tag}><rdf:Seq>${items.map(value => `<rdf:li>${escapeXml(value)}</rdf:li>`).join('')}</rdf:Seq></${tag}>`
    : '';
}

export interface ResolvedPublicationMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  xmp: string;
}

export function resolvePublicationMetadata(projectState: ProjectState): ResolvedPublicationMetadata {
  const metadata = projectState.publication_metadata;
  const parsed = parseStoryScript(projectState.global_script || '');
  const contributors = metadata?.contributors?.filter(contributor => trimmed(contributor.name)) ?? [];
  const authors = contributors.filter(contributor => contributor.role === 'author').map(contributor => trimmed(contributor.name));
  const creatorNames = contributors.map(contributor => trimmed(contributor.name));
  const title = trimmed(metadata?.title) || projectState.project_name;
  const author = authors.join('; ') || parsed.author;
  const subject = trimmed(metadata?.description);
  const keywords = metadata?.keywords?.map(trimmed).filter(Boolean) ?? [];
  const identifiers = metadata?.identifiers
    ?.filter(identifier => trimmed(identifier.value))
    .map(identifier => `${identifier.scheme}:${trimmed(identifier.value)}`) ?? [];
  const derivedCopyright = trimmed(metadata?.copyright_holder) || trimmed(metadata?.copyright_year)
    ? `© ${[trimmed(metadata?.copyright_year), trimmed(metadata?.copyright_holder)].filter(Boolean).join(' ')}`
    : '';
  const rights = [trimmed(metadata?.copyright_notice) || derivedCopyright, trimmed(metadata?.license_name)].filter(Boolean).join(' ');

  const xmp = [
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/">',
    rdfAlt('dc:title', title),
    rdfSeq('dc:creator', creatorNames.length > 0 ? creatorNames : author ? [author] : []),
    rdfAlt('dc:description', subject),
    rdfBag('dc:subject', keywords),
    rdfBag('dc:language', trimmed(metadata?.language) ? [trimmed(metadata?.language)] : []),
    rdfBag('dc:publisher', trimmed(metadata?.publisher) ? [trimmed(metadata?.publisher)] : []),
    rdfAlt('dc:rights', rights),
    rdfBag('dc:identifier', identifiers),
    trimmed(metadata?.publication_date) ? `<dc:date><rdf:Seq><rdf:li>${escapeXml(trimmed(metadata?.publication_date))}</rdf:li></rdf:Seq></dc:date>` : '',
    trimmed(metadata?.license_url) ? `<xmpRights:WebStatement>${escapeXml(trimmed(metadata?.license_url))}</xmpRights:WebStatement>` : '',
    '<xmp:CreatorTool>Storybook Co-Editor</xmp:CreatorTool>',
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
  ].join('');

  return { title, author, subject, keywords: keywords.join(', '), xmp };
}

export function applyPublicationMetadataToPdf(pdf: jsPDF, projectState: ProjectState): void {
  const metadata = resolvePublicationMetadata(projectState);
  pdf.setProperties({
    title: metadata.title,
    author: metadata.author,
    subject: metadata.subject,
    keywords: metadata.keywords,
    creator: 'Storybook Co-Editor',
  });
  pdf.addMetadata(metadata.xmp, true);
  pdf.viewerPreferences({ DisplayDocTitle: true });
}
