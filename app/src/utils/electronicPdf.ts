import { jsPDF } from 'jspdf';
import type { ProjectState } from '../ProjectContext';
import { buildExportPages, renderExportPageToCanvas } from './exportPages';
import { applyPublicationMetadataToPdf } from './publicationMetadata';

export interface ElectronicPdfProgress {
  current: number;
  total: number;
}

const PDF_LONG_EDGE_PT = 842;

function getPdfPageSize(width: number, height: number): [number, number] {
  const scale = PDF_LONG_EDGE_PT / Math.max(width, height);
  return [width * scale, height * scale];
}

export function getElectronicPdfPageCount(projectState: ProjectState): number {
  return buildExportPages(projectState, projectState.visible_images, 'electronic').length;
}

export async function generateElectronicPdf(
  projectState: ProjectState,
  onProgress?: (progress: ElectronicPdfProgress) => void,
): Promise<Uint8Array> {
  const imageSources = projectState.visible_images.map(source => (
    source.startsWith('blank://') ? source : `http://127.0.0.1:14320/images/${source}`
  ));
  const pages = buildExportPages(projectState, imageSources, 'electronic');
  if (pages.length === 0) throw new Error('项目中没有可导出的页面。');

  let pdf: jsPDF | null = null;

  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    const canvas = await renderExportPageToCanvas(page);
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

    if (page.kind === 'copyright') {
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    } else {
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
    }
    onProgress?.({ current: index + 1, total: pages.length });
  }

  if (!pdf) throw new Error('项目中没有可导出的页面。');

  applyPublicationMetadataToPdf(pdf, projectState);

  return new Uint8Array(pdf.output('arraybuffer'));
}
