import { describe, expect, it } from 'vitest';
import type { PrintSettings } from '../project/model';
import { calculateImposition } from './imposition';

const baseSettings: PrintSettings = {
  paper_size: 'A4',
  paper_orientation: 'portrait',
  book_size: 'A5',
  layout_mode: '2-up',
  binding_method: 'saddle',
  has_back_cover: true,
  spine_mm: 5,
  binding_margin_mm: 10,
  hardware_margin_mm: 0,
  crop_marks: true,
  offset_x: 0,
  offset_y: 0,
  paper_alignment: 'left',
  auto_snap_content: true,
  double_sided: true,
};

describe('calculateImposition', () => {
  it('places the back and front covers on the cover sheet', () => {
    const sheets = calculateImposition(6, baseSettings);
    expect(sheets[0]).toEqual({
      id: 'sheet-cover',
      isCover: true,
      front: { left: 5, right: 0 },
    });
  });

  it('pads saddle signatures without exposing sentinel page indexes', () => {
    const sheets = calculateImposition(6, baseSettings);
    expect(sheets[1]).toEqual({
      id: 'sheet-saddle-1',
      front: { left: 4, right: 1 },
      back: { left: 2, right: 3 },
    });
  });

  it('keeps one-up perfect binding in sequential front/back pairs', () => {
    const sheets = calculateImposition(3, {
      ...baseSettings,
      layout_mode: '1-up',
      binding_method: 'perfect',
    });
    expect(sheets).toEqual([
      {
        id: 'sheet-1up-1',
        isCover: false,
        front: { left: 0, right: null },
        back: { left: 1, right: null },
      },
      {
        id: 'sheet-1up-2',
        isCover: false,
        front: { left: 2, right: null },
        back: { left: null, right: null },
      },
    ]);
  });
});
