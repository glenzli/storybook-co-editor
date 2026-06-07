// Shared store for the editor's actual measured container dimensions.
// EditorScreen sets these via ResizeObserver on containerRef;
// PrintScreen reads them for CSS-transform-based text overlay scaling.

let _w = 700;
let _h = 700;

export function setEditorContainerSize(w: number, h: number) {
    _w = w;
    _h = h;
}

export function getEditorContainerSize() {
    return { w: _w, h: _h };
}
