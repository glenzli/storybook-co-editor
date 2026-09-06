import { describe, expect, it } from 'vitest';
import fixtureManifestJson from '../../../fixtures/publication-20260906.01/manifest.json?raw';
import type { ProjectState } from '../project/model';
import {
  buildPublicationManifest,
  canonicalJson,
  createPublishedPageId,
  getPublishedFontId,
  isSafePublicationPath,
  sha256Hex,
  type PublishedPage,
  type PublishedLanguagePage,
  type PublishedResource,
} from './format';

const projectState: ProjectState = {
  schema_version: 2,
  project_name: 'Contract Fixture',
  last_modified: '2026-09-04T00:00:00Z',
  visible_images: ['/private/source/cover.png'],
  trashed_images: ['/private/source/deleted.png'],
  source_url_map: { private: 'cover.png' },
  global_script: '[Cover]\nContract Fixture',
  canvas_width: 1024,
  canvas_height: 768,
  print_settings: {
    paper_size: 'A4',
    paper_orientation: 'portrait',
    book_size: 'A5',
    layout_mode: '1-up',
    binding_method: 'perfect',
    has_back_cover: false,
    spine_mm: 0,
    binding_margin_mm: 0,
    hardware_margin_mm: 0,
    crop_marks: false,
    offset_x: 0,
    offset_y: 0,
    paper_alignment: 'center',
    auto_snap_content: true,
    double_sided: false,
  },
  page_settings: {
    '0': { print_only: true },
  },
  publication_metadata: {
    title: 'Contract Fixture',
    language: 'en-US',
    description: 'Published contract fixture.',
    contributors: [{ role: 'author', name: 'Example Author' }],
    copyright_page_mode: 'electronic',
  },
};

const pages: PublishedPage[] = [{
  id: 'page-contract',
  order: 0,
  image: {
    src: 'pages/0001.webp',
    width: 1024,
    height: 768,
    alt: null,
    mimeType: 'image/webp',
    bytes: 4,
    sha256: '054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8',
  },
}];

const languagePages: PublishedLanguagePage[] = [{
  id: 'page-contract',
  role: 'cover',
  textLayers: [{
    id: 'main',
    text: 'Contract Fixture',
    lines: [{ text: 'Contract Fixture', x: 512, y: 728 }],
    position: { x: 512, y: 728, maxWidth: 928, anchor: 'center-bottom' },
    style: {
      font: 'noto-serif-sc',
      fontFamily: 'serif',
      fontSize: 40,
      lineHeight: 60,
      color: '#ffffff',
      align: 'center',
      strokeColor: 'rgba(0,0,0,0.8)',
      strokeWidth: 3.2,
      shadow: null,
      backdropColor: null,
      backdropX: null,
      backdropY: null,
      backdropWidth: null,
      backdropHeight: null,
      backdropPaddingX: 20,
      backdropPaddingY: 8,
      backdropRadius: 0,
    },
  }],
}];

const resources: PublishedResource[] = [{
  path: 'pages/0001.webp',
  mimeType: 'image/webp',
  bytes: 4,
  sha256: '054edec1d0211f624fed0cbca9d4f9400b0e491c43742af2c5b0abebf0c990d8',
}];

describe('publication format 20260906.01', () => {
  it('separates shared artwork from language-specific metadata and text', async () => {
    const manifest = await buildPublicationManifest({
      projectState,
      createdAt: '2026-09-04T00:00:00Z',
      defaultLanguage: 'en-US',
      languages: [{ language: 'en-US', projectState, pages: languagePages }],
      pages,
      resources,
    });
    const serialized = JSON.stringify(manifest);

    expect(manifest.format).toBe('storybook-publication');
    expect(manifest.formatVersion).toBe('20260906.01');
    expect(manifest.canvas).toEqual({ width: 1024, height: 768 });
    expect(manifest.fontPack.compatibility).toBe('storybook-co-editor-fonts-v1');
    expect(manifest.defaultLanguage).toBe('en-US');
    expect(manifest.languages[0].publication.language).toBe('en-US');
    expect(manifest.languages[0].publication.readingDirection).toBe('ltr');
    expect(manifest.languages[0].pages[0].textLayers[0].lines[0]).toEqual({ text: 'Contract Fixture', x: 512, y: 728 });
    expect(manifest.pages[0]).not.toHaveProperty('textLayers');
    expect(manifest.integrity.publicationSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(serialized).not.toContain('/private/source');
    expect(serialized).not.toContain('trashed_images');
    expect(serialized).not.toContain('print_settings');
    expect(serialized).not.toContain('page_settings');
    expect(serialized).not.toContain('copyright_page_mode');
  });

  it('requires every language to cover the shared page set', async () => {
    await expect(buildPublicationManifest({
      projectState,
      createdAt: '2026-09-04T00:00:00Z',
      defaultLanguage: 'en-US',
      languages: [{ language: 'en-US', projectState, pages: [] }],
      pages,
      resources,
    })).rejects.toThrow('PUBLICATION_LANGUAGE_PAGE_MISMATCH');
  });

  it('uses stable content-derived page ids and logical font ids', async () => {
    expect(await createPublishedPageId('cover.png')).toBe(await createPublishedPageId('cover.png'));
    expect(await createPublishedPageId('cover.png', 1)).not.toBe(await createPublishedPageId('cover.png'));
    expect(getPublishedFontId('LXGW WenKai')).toBe('lxgw-wenkai');
    expect(getPublishedFontId('Unknown Local Font')).toBe('noto-sans-sc');
  });

  it('accepts only portable relative resource paths', () => {
    expect(isSafePublicationPath('pages/0001.webp')).toBe(true);
    expect(isSafePublicationPath('../secret')).toBe(false);
    expect(isSafePublicationPath('/absolute/path')).toBe(false);
    expect(isSafePublicationPath('pages\\0001.webp')).toBe(false);
  });

  it('computes stable SHA-256 resource digests', async () => {
    expect(await sha256Hex(new Uint8Array([0, 1, 2, 3]))).toBe(resources[0].sha256);
  });

  it('keeps the contract fixture internally consistent', async () => {
    const fixture = JSON.parse(fixtureManifestJson);
    const { integrity, ...manifestContent } = fixture;

    expect(await sha256Hex(canonicalJson(manifestContent))).toBe(integrity.publicationSha256);
  });
});
