import { jsPDF } from 'jspdf';
import type { ProjectState } from '../ProjectContext';
import { buildStoryPages, parseStoryScript, renderStoryPageToCanvas } from './storyPageRenderer';

export interface ElectronicPdfProgress {
  current: number;
  total: number;
}

const PDF_LONG_EDGE_PT = 842;

function getPdfPageSize(width: number, height: number): [number, number] {
  const scale = PDF_LONG_EDGE_PT / Math.max(width, height);
  return [width * scale, height * scale];
}

export async function generateElectronicPdf(
  projectState: ProjectState,
  onProgress?: (progress: ElectronicPdfProgress) => void,
): Promise<Uint8Array> {
  const imageSources = projectState.visible_images.map(source => (
    source.startsWith('blank://') ? source : `http://127.0.0.1:14320/images/${source}`
  ));
  const pages = buildStoryPages(projectState, imageSources);
  if (pages.length === 0) throw new Error('项目中没有可导出的页面。');

  let pdf: jsPDF | null = null;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const canvas = await renderStoryPageToCanvas(page);
    const [pageWidth, pageHeight] = getPdfPageSize(page.width, page.height);
    const orientation = pageWidth > pageHeight ? 'landscape' : 'portrait';

    if (!pdf) {
      pdf = new jsPDF({
        orientation,
        unit: 'pt',
        format: [pageWidth, pageHeight],
        compress: true,
      });
    } else {
      pdf.addPage([pageWidth, pageHeight], orientation);
    }

    pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    onProgress?.({ current: index + 1, total: pages.length });
  }

  if (!pdf) throw new Error('项目中没有可导出的页面。');

  const parsed = parseStoryScript(projectState.global_script || '');
  pdf.setProperties({
    title: projectState.project_name,
    author: parsed.author,
    creator: 'Storybook Co-Editor',
  });

  return new Uint8Array(pdf.output('arraybuffer'));
}
