# Web publication format

Storybook Co-Editor exports a finished multilingual book as a `.scpub` ZIP archive:

```text
manifest.json
pages/
  0001.webp
  0002.webp
```

The current `formatVersion` is the string `20260908.02`. Format versions use `YYYYMMDD.NN`; `NN` starts at `01` for each date. An emitted version is never reassigned to a different schema. Readers accept explicitly supported versions instead of inferring compatibility from date order.

Page artwork is shared by every language. Text and publication metadata are stored separately for each language.

## Manifest

`manifest.json` is UTF-8 JSON with:

- `format`: `storybook-publication`
- `formatVersion`: `20260908.02`
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
- `pages`: an ordered, nonempty subset of the shared pages, linked by ID, containing its role and frozen `textLayers`. Every shared page is referenced by at least one language; duplicate, unknown, or out-of-order IDs are invalid. Earlier versions require a complete one-to-one list.

A language page uses the same ID as its shared artwork page. Each text layer records its source text, frozen line positions, maximum text width, anchor, font, size, color, outline or halo, and optional panel or painted-wash backdrop. Painted washes include a deterministic frozen path and feather radius. Version `20260908.01` added `style.backdropPigment`: `null` for untextured effects, or an ordered array of frozen paint passes. Each pass contains `path`, `opacity` (0–1), `blur` (canvas pixels), `clip` (boolean), and `strokeWidth` (positive canvas pixels or `null` for fill). Render passes in array order with the parent `backdropColor`; use `backdropPath` as a clip only when `clip` is true. Apply opacity to each pass, blur its fill/stroke, then clip the result. When pigment passes exist, they replace the single flat backdrop fill. Draw halo/outline/text afterward. No seed or procedural rerendering is required by readers. Text layout and readability treatment may differ between languages and pages.

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

Readers and importers, including dev-site, need to support `20260908.02`, font pack 2, `style.fontWeight`, shared `pages`, language-specific `languages[].pages`, and the resolved text readability fields before accepting newly exported packages.

## Excluded state

The package does not contain source file paths, original images, trash, editing adjustment values, AI sessions or candidates, print settings, electronic PDF settings, or project history. Editable work remains in `.scproj`; PDF remains a separate single-language export.

The expanded example is in [`fixtures/publication-20260908.02`](../fixtures/publication-20260908.02).

Manifest integrity hashes the canonical JSON without the top-level `integrity`
field. Object keys use UTF-16 lexical order; arrays retain order. The exporter
writes numbers using JavaScript `JSON.stringify`. Native validation preserves
these numeric tokens when sorting and compacting the manifest, avoiding a lossy
floating-point parse/serialize round trip. SHA-256 verification remains mandatory.

Previously emitted `20260906.02` packages remain valid with their single-color washes. Their schema and fixtures are unchanged.


## Copyright pages (20260908.02)

The electronic copyright-page setting is honored per language: `none` omits it;
`electronic` and `all` include it when publication metadata exists. A shared
white copyright artwork page is inserted after the cover, or after the title
page when present. Languages which omit it skip its ID in their page sequence.
Page counts in readers use the selected language's sequence, not resource count.

Its role is `copyright`. Each localized label, value, and rights paragraph is a
frozen text layer produced by the same measured layout as the PDF copyright page.
No consumer-side metadata layout or translation is needed. Thin rules use the
existing panel-backdrop rectangles. Copyright text uses stable `copyright-N` IDs;
text layer IDs are now bounded safe strings, rather than only `main`/`author`.
`style.align` supports `left` and `center`. Required `style.baseline` is `top` or
`bottom`, rendered as SVG `text-before-edge` or `text-after-edge`; older packages
implicitly use `bottom`. Frozen line coordinates are authoritative; the legacy
`position.anchor` remains `center-bottom` for compatibility and is not used to
reflow text. Copyright typography uses 400, 500, and 600 weights; a missing bundled
weight is synthesized, as it is by the existing Canvas PDF renderer.

Previously emitted `20260908.01` pigment packages remain unchanged and supported.
