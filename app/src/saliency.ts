/**
 * Saliency detection using U²-Net Lite via ONNX Runtime Web.
 * Detects salient objects (characters, key items) in an image,
 * returning a map of "importance" per pixel. Used to find empty
 * regions suitable for text placement.
 */
import * as ort from 'onnxruntime-web';

const MODEL_SIZE = 320;
// ImageNet normalization
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

let session: ort.InferenceSession | null = null;
let loading: Promise<boolean> | null = null;

/** Initialize the ONNX session (lazy, singleton). */
export async function initSaliency(): Promise<boolean> {
  if (session) return true;
  if (loading) return loading;

  loading = (async () => {
    try {
      ort.env.wasm.wasmPaths = '/';
      session = await ort.InferenceSession.create('/u2netp.onnx', {
        executionProviders: ['wasm'],
      });
      console.log('[Saliency] Model loaded, inputs:', session.inputNames, 'outputs:', session.outputNames);
      return true;
    } catch (e) {
      console.error('[Saliency] Failed to load model:', e);
      return false;
    }
  })();
  return loading;
}

/**
 * Get saliency map for an image.
 * Returns a Float32Array of size imgW × imgH with values 0..1
 * (1 = highly salient / foreground, 0 = background).
 * Also returns the original image dimensions.
 */
export async function getSaliencyMap(
  imageUrl: string
): Promise<{ map: Float32Array; width: number; height: number } | null> {
  if (!session) {
    const ok = await initSaliency();
    if (!ok) return null;
  }

  // Load image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageUrl;
  });

  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // Draw to canvas at model input size
  const canvas = document.createElement('canvas');
  canvas.width = MODEL_SIZE;
  canvas.height = MODEL_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, MODEL_SIZE, MODEL_SIZE);
  const { data } = ctx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);

  // Preprocess: NCHW, ImageNet normalization
  const pixels = MODEL_SIZE * MODEL_SIZE;
  const input = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    input[i] = (data[i * 4] / 255.0 - MEAN[0]) / STD[0];                   // R
    input[pixels + i] = (data[i * 4 + 1] / 255.0 - MEAN[1]) / STD[1];       // G
    input[2 * pixels + i] = (data[i * 4 + 2] / 255.0 - MEAN[2]) / STD[2];   // B
  }

  // Run inference
  const tensor = new ort.Tensor('float32', input, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const inputName = session!.inputNames[0];
  const results = await session!.run({ [inputName]: tensor });

  // First output (d0) is the finest saliency map, shape [1, 1, 320, 320]
  const outputName = session!.outputNames[0];
  const raw = results[outputName].data as Float32Array;

  // Sigmoid + normalize to [0, 1]
  const sigmoid = new Float32Array(raw.length);
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    sigmoid[i] = 1 / (1 + Math.exp(-raw[i]));
    if (sigmoid[i] < min) min = sigmoid[i];
    if (sigmoid[i] > max) max = sigmoid[i];
  }
  const range = max - min || 1;
  for (let i = 0; i < sigmoid.length; i++) {
    sigmoid[i] = (sigmoid[i] - min) / range;
  }

  // Resize saliency map back to a working resolution for scoring
  // We keep it at MODEL_SIZE for efficiency — the caller can map coordinates
  return { map: sigmoid, width: MODEL_SIZE, height: MODEL_SIZE };
}

/**
 * Find the best Y position for text given a saliency map.
 * Returns offsetY (relative to CSS bottom-10 base), text color, and author offset.
 */
export function findBestTextPosition(
  saliencyMap: Float32Array,
  mapW: number,
  mapH: number,
  canvasH: number,
  boundsMinY: number,
  boundsMaxY: number,
  authorBoundsMinY: number,
  authorBoundsMaxY: number,
  imgUrl?: string,
): { offsetY: number; textColor: string; authorOffsetY: number } {
  // Candidate positions (normalized Y, 0=top, 1=bottom)
  const candidates = [
    { yNorm: 0.90, posWeight: 1.25 },  // 底部
    { yNorm: 0.82, posWeight: 1.15 },  // 中下
    { yNorm: 0.94, posWeight: 0.95 },  // 最底部
    { yNorm: 0.08, posWeight: 1.05 },  // 顶部
    { yNorm: 0.18, posWeight: 0.95 },  // 上方
  ];

  const BAND_H = Math.round(mapH * 0.10); // text band height
  const PAD_X = Math.round(mapW * 0.05);

  const scored = candidates.map(c => {
    const centerY = Math.round(c.yNorm * mapH);
    const y0 = Math.max(0, centerY - Math.floor(BAND_H / 2));
    const y1 = Math.min(mapH, centerY + Math.floor(BAND_H / 2));

    // Average saliency in text band (lower = more empty = better)
    let salSum = 0, count = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = PAD_X; x < mapW - PAD_X; x++) {
        salSum += saliencyMap[y * mapW + x];
        count++;
      }
    }
    const avgSaliency = count > 0 ? salSum / count : 1;

    // Score: low saliency is good
    const emptiness = 1 - avgSaliency; // 0..1, higher = better
    const score = emptiness * c.posWeight;

    return { ...c, avgSaliency, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // Convert to offset_y
  const defaultTextY = canvasH * 0.85;
  const targetY = best.yNorm * canvasH;
  let offsetY = Math.round(targetY - defaultTextY);
  offsetY = Math.max(boundsMinY, Math.min(boundsMaxY, offsetY));

  // Determine text color from the saliency band brightness
  // For now use saliency as proxy: if salient area is bright, use dark text
  // We'll need actual brightness — use a simple heuristic based on position
  const textColor = best.avgSaliency < 0.3 ? '#ffffff' : '#000000';

  // Smart author placement: if main text is at the bottom, put author above it; else below it.
  const isAtBottom = best.yNorm > 0.85;
  const authorOffsetRaw = offsetY + (isAtBottom ? -Math.round(canvasH * 0.05) : Math.round(canvasH * 0.05));
  const authorOffsetY = Math.max(authorBoundsMinY, Math.min(authorBoundsMaxY, authorOffsetRaw));

  return { offsetY, textColor, authorOffsetY };
}
