import { describe, expect, it } from 'vitest';
import type { ProjectState } from '../project/model';
import { migrateProjectState } from '../project/migrate';
import { ProjectHistory, sameProjectContent } from '../project/history';
import { planImageImport, type ImportedImage } from './localImageImport';

const image = (filename: string, status: ImportedImage['status'] = 'new'): ImportedImage => (
  { filename, status, width: 1600, height: 900 }
);

function project(): ProjectState {
  return migrateProjectState({
    schema_version: '20260907.01',
    project_name: 'Import',
    visible_images: ['cover.png', 'page.png'],
    trashed_images: ['trash.png'],
    canvas_width: 1024,
    canvas_height: 1024,
    image_adjustments: { '1': { brightness: 1.2 } },
    page_settings: { '1': { print_only: true } },
    page_text_overrides: { '1': { offset_x: 2 } },
    default_language: 'zh-CN',
    languages: {
      'zh-CN': { script: '[Cover]\n封面\n[1]\n正文', page_text_overrides: { '1': { offset_x: 10 } } },
      'en-US': { script: '[Cover]\nCover\n[1]\nPage', page_text_overrides: { '1': { offset_x: 20 } } },
    },
  });
}

describe('local image import projection', () => {
  it('inserts an ordered batch and keeps existing page styles attached in every language', () => {
    const original = project();
    const baseline = structuredClone(original);
    const plan = planImageImport(original, [image('one.png'), image('two.png')], 0);
    const next = { ...original, ...plan.updates };
    expect(next.visible_images).toEqual(['cover.png', 'one.png', 'two.png', 'page.png']);
    expect(next.image_adjustments).toEqual({ '3': { brightness: 1.2 } });
    expect(next.page_settings).toEqual({ '3': { print_only: true } });
    expect(next.languages?.['zh-CN'].page_text_overrides).toEqual({ '3': { offset_x: 10 } });
    expect(next.languages?.['en-US'].page_text_overrides).toEqual({ '3': { offset_x: 20 } });
    expect(plan.selectedIndex).toBe(1);
    expect(original).toEqual(baseline);
  });

  it('does not duplicate visible pages, repeated inputs, or resurrect trashed pages', () => {
    const plan = planImageImport(project(), [
      image('page.png', 'duplicate'), image('new.png'), image('new.png', 'duplicate'),
      image('trash.png'), image('other-trash.png', 'trashed'),
    ], null);
    expect(plan.updates.visible_images).toEqual(['cover.png', 'page.png', 'new.png']);
    expect(plan).toMatchObject({ added: 1, duplicates: 2, trashed: 2 });
    expect(planImageImport(project(), [image('page.png')], 0).updates).toEqual({});
  });

  it('fits the first artwork to an untouched empty canvas and preserves a chosen canvas', () => {
    const empty = { ...project(), visible_images: [] };
    expect(planImageImport(empty, [image('cover.png')], null).updates).toMatchObject({
      visible_images: ['cover.png'], canvas_width: 1600, canvas_height: 900,
    });
    expect(planImageImport({ ...empty, canvas_width: 1200 }, [image('cover.png')], null).updates)
      .not.toHaveProperty('canvas_width');
  });

  it('undoes and redoes the whole batch including multilingual page settings', () => {
    const original = project();
    const history = new ProjectHistory<ProjectState>(structuredClone, 50, sameProjectContent);
    history.reset(original);
    const plan = planImageImport(original, [image('new.png'), image('other.png')], 0);
    const imported = { ...original, ...plan.updates };
    history.push(imported);
    expect(history.undo()).toEqual(original);
    expect(history.redo()).toEqual(imported);
    // The copied asset can be imported again after undo without creating another file.
    expect(planImageImport(original, [image('new.png', 'duplicate')], 0).added).toBe(1);
  });
});
