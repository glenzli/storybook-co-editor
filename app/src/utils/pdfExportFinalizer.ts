import { invoke } from '@tauri-apps/api/core';
import { remove, writeFile } from '@tauri-apps/plugin-fs';
import type { ElectronicPdfSettings } from '../project/model';
import {
  resolveElectronicPdfSettings,
  type ElectronicPdfExportSecrets,
} from './electronicPdfSettings';

export async function writeElectronicPdf(
  path: string,
  bytes: Uint8Array,
  settings: ElectronicPdfSettings,
  secrets: ElectronicPdfExportSecrets,
): Promise<void> {
  const resolved = resolveElectronicPdfSettings(settings);
  await writeFile(path, bytes);
  if (!resolved.encryption_enabled) return;

  try {
    await invoke('protect_pdf', {
      path,
      options: {
        printing: resolved.printing,
        allowCopying: resolved.allow_copying,
        allowModification: resolved.allow_modification,
        allowAnnotations: resolved.allow_annotations,
        openPassword: secrets.openPassword || '',
      },
    });
  } catch (error) {
    try {
      await remove(path);
    } catch {
      // Preserve the original encryption error; cleanup is best effort.
    }
    throw error;
  }
}
