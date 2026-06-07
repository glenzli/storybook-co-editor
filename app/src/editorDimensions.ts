// Shared module-level store for the editor's layout constraints.
// EditorScreen sets these when the image container resizes;
// PrintScreen reads them to compute per-image editor container size.

let _availW = 700;  // main area content width (px)
let _maxH = 700;    // max image height = 85vh (px)

export function setEditorConstraints(availW: number, maxH: number) {
    _availW = availW;
    _maxH = maxH;
}

/**
 * Compute what the editor's image container size would be for a given image aspect ratio.
 * The editor uses max-w-full max-h-[85vh] and the container wraps the image tightly.
 */
export function getEditorContainerSize(imgAspect: number) {
    const w = Math.min(_availW, _maxH * imgAspect);
    const h = Math.min(_maxH, _availW / imgAspect);
    return { w, h };
}
