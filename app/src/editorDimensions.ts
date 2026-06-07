// Shared module-level store for the editor's actual rendered image dimensions.
// EditorScreen sets these when the image container resizes;
// PrintScreen reads them to compute text overlay scaling.

let _width = 700;
let _height = 700;

export function setEditorImageDimensions(w: number, h: number) {
    _width = w;
    _height = h;
}

export function getEditorImageDimensions() {
    return { w: _width, h: _height };
}
