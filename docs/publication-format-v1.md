# Web publication format v1

Storybook Co-Editor exports a finished book as an expanded directory or a `.scpub` ZIP archive. Both forms use the same layout:

```text
manifest.json
pages/
  0001.webp
  0002.webp
```

The directory structure is normative. `.scpub` is the portable transport form.

## Manifest

`manifest.json` is UTF-8 JSON with:

- `format`: `storybook-publication`
- `formatVersion`: `1`
- `createdAt`: export time in ISO 8601 form
- `publication`: publication ID, title, contributors, language, reading direction, description, keywords, publisher, date, copyright, license, and identifiers
- `canvas`: page width and height in canvas pixels
- `fontPack`: shared webfont registry contract
- `pages`: ordered finished pages
- `resources`: packaged resource paths, media types, byte sizes, and SHA-256 digests
- `integrity`: manifest content digest

Each page has a stable `id`, zero-based `order`, `role`, one text-free WebP `image`, and zero or more `textLayers`. Image background, scale, crop, offset, and image adjustments are baked into the WebP.

Pages marked as print-only in the source project are omitted from web publications. The remaining pages and resource paths are numbered contiguously.

Each text layer records its original `text`, frozen `lines` as `{text, x, y}`, an anchor position, and final style values. Coordinates and font sizes use canvas pixels. The current format supports centered text, optional stroke, and an optional rounded backdrop. `shadow` is reserved and is `null` in v1.

Image `alt` is nullable in v1 because the editor does not currently author image descriptions.

## Fonts

Books refer to the shared versioned font registry:

```json
{
  "id": "glenzli-books-webfonts",
  "version": "1",
  "compatibility": "storybook-co-editor-fonts-v1"
}
```

`style.font` is the logical registry font ID. Font files are not copied into a book. `style.fontFamily` preserves the editor family name for inspection; readers select the packaged webfont by `style.font`.

## Integrity and paths

All resource paths are relative, use `/`, and remain under `pages/`. Absolute paths, `..`, backslashes, duplicate entries, and undeclared files are rejected.

`resources[].sha256` covers the exact resource bytes. `integrity.publicationSha256` covers the manifest with `integrity` removed, encoded as compact UTF-8 JSON with object keys recursively sorted and array order preserved.

## Excluded state

The package does not contain source file paths, original images, trash, editing adjustment values, AI sessions or candidates, print settings, electronic PDF settings, or project history. Editable work remains in `.scproj`; PDF remains a separate export.

The expanded example is in [`fixtures/publication-v1`](../fixtures/publication-v1).
