# Web publication format

Storybook Co-Editor exports a finished multilingual book as a `.scpub` ZIP archive:

```text
manifest.json
pages/
  0001.webp
  0002.webp
```

The current `formatVersion` is the string `20260906.02`. Format versions use `YYYYMMDD.NN`; `NN` starts at `01` for each date. An emitted version is never reassigned to a different schema. Readers accept explicitly supported versions instead of inferring compatibility from date order.

Page artwork is shared by every language. Text and publication metadata are stored separately for each language.

## Manifest

`manifest.json` is UTF-8 JSON with:

- `format`: `storybook-publication`
- `formatVersion`: `20260906.02`
- `createdAt`: export time in ISO 8601 form
- `defaultLanguage`: the BCP 47 language shown first by readers
- `languages`: language-specific publication metadata, page roles, and frozen text layers
- `canvas`: page width and height in canvas pixels
- `fontPack`: shared webfont registry contract
- `pages`: ordered shared page artwork
- `resources`: packaged resource paths, media types, byte sizes, and SHA-256 digests
- `integrity`: manifest content digest

Each entry in `pages` contains a stable page ID, order, and text-free WebP image. Image background, scale, crop, offset, and image adjustments are baked into the WebP once.

Each entry in `languages` contains:

- `language`: BCP 47 language tag
- `publication`: title, contributors, description, keywords, publisher, date, copyright, license, identifiers, and reading direction for that language
- `pages`: one entry for every shared page, in the same order, containing its role and frozen `textLayers`

A language page uses the same ID as its shared artwork page. Each text layer records its source text, frozen line positions, maximum text width, anchor, font, size, color, outline or halo, and optional panel or painted-wash backdrop. Painted washes include a deterministic frozen path and feather radius. Text layout and readability treatment may differ between languages and pages.

Pages marked as print-only in the source project are omitted from the shared page list and from every language. Remaining page resources are numbered contiguously.

## Fonts

Books refer to the shared versioned font registry:

```json
{
  "id": "glenzli-books-webfonts",
  "version": "2",
  "compatibility": "storybook-co-editor-fonts-v2"
}
```

`style.font` is the logical registry font ID and `style.fontWeight` is its numeric weight. Font files are not copied into a book. Pack 2 adds `Yozai` light/regular, `Xiaolai` regular, and the light weight of `LXGW WenKai`; readers must not silently substitute a different font because frozen line geometry depends on both family and weight metrics.

## Integrity and paths

All resource paths are relative, use `/`, and remain under `pages/`. Absolute paths, `..`, backslashes, duplicate entries, and undeclared files are rejected.

`resources[].sha256` covers the exact resource bytes. `integrity.publicationSha256` covers the manifest with `integrity` removed, encoded as compact UTF-8 JSON with object keys recursively sorted and array order preserved.

## Consumer update

Readers and importers, including dev-site, need to support `20260906.02`, font pack 2, `style.fontWeight`, shared `pages`, language-specific `languages[].pages`, and the resolved text readability fields before accepting newly exported packages.

## Excluded state

The package does not contain source file paths, original images, trash, editing adjustment values, AI sessions or candidates, print settings, electronic PDF settings, or project history. Editable work remains in `.scproj`; PDF remains a separate single-language export.

The expanded example is in [`fixtures/publication-20260906.02`](../fixtures/publication-20260906.02).
