# Storybook Co-Editor

<p align="center">
  <a href="./README.md">简体中文</a> · <strong>English</strong>
</p>

<p align="center">
  <img src="docs/images/banner.png" alt="Storybook Co-Editor" width="100%" />
</p>

Storybook Co-Editor is a local storybook layout tool. Its Chrome extension collects images from web pages. The macOS desktop app manages page order and scripts, adjusts images, saves projects, and exports electronic and print PDFs.

The current version is `1.3.0`. Projects use the `.scproj` format, and the interface is available in English and Simplified Chinese.

- [Download a release](https://gitlab.com/glenzli/storybook-co-editor/-/releases)
- Local service: `http://127.0.0.1:14320`

![Chrome extension image controls](docs/images/extension-overlay.png)

*The Chrome extension sends web images to a local project and can mark reference images.*

![Storybook editor](docs/images/app-editor.png)

*The desktop app manages pages, scripts, text styles, and image settings.*

![Prepress imposition](docs/images/app-prepress.png)

*The prepress view covers paper, binding, margins, crop marks, and duplex printing.*

## Current Capabilities

- **Web capture**: read images from web pages, lazy-loaded elements, and common image links; send images or references from an overlay; and deduplicate them by content hash.
- **Storybook editing**: reorder pages and manage covers, title pages, body pages, blank pages, and trash. Text styles, page backgrounds, image scale, and image position can be set per page type or page.
- **Script layout**: map script text to pages with `[Cover]`, `[Author]`, `[Title]`, and numbered tags. Equivalent Chinese tags are also supported.
- **Image adjustments**: adjust brightness, exposure, contrast, highlights, shadows, saturation, temperature, tint, and selective HSL per page, with background processing based on a selected color.
- **Project storage**: `.scproj` packages contain project data, image assets, and trash. The app supports recent projects, autosave, Save As, undo, and redo.
- **PDF export**: export page-by-page electronic PDFs or print PDFs based on paper, binding, and printer margins. Publication metadata, copyright pages, and electronic PDF permissions are supported.
- **Codex (optional)**: use the local Codex App Server to propose script edits, create pages, and redraw images. Changes and image candidates are reviewed before they are written to the project.
- **MCP (optional)**: the local MCP service can read the active project and script, replace the script, read page layout, and adjust text positions. Writes use the project modification time to detect concurrent updates.

## Current Boundaries

- The current release targets Apple silicon macOS and has not been Apple-notarized.
- The Chrome extension is distributed as a zip archive and must be loaded through Developer Mode in `chrome://extensions`.
- Editing, storage, image processing, and PDF export run locally. Codex polishing, creation, and redraw send the relevant text, instructions, and selected reference images to the active model service.
- MCP listens only on `127.0.0.1:14320` and uses a random local token. The token grants read and write access to the open project and should be shared only with trusted local clients.
- MCP resources omit image pixels. Creation and redraw are started separately by the desktop app, and candidates stay outside `.scproj` until confirmed.
- PDF permissions record the publisher's intended restrictions. Screenshots and specialized tools can still bypass them. Open passwords apply to one export and are not stored in the project.

## Installation

Download the current packages from [GitLab Releases](https://gitlab.com/glenzli/storybook-co-editor/-/releases):

```text
storybook-co-editor_1.3.0_aarch64.dmg
storybook-co-editor-extension-v1.3.0.zip
```

1. Install and open the macOS desktop app.
2. Unzip the Chrome extension package.
3. Open `chrome://extensions`, enable Developer Mode, and load the unzipped directory.
4. Keep the desktop app running and use the extension's `Send` control on a web image.

If macOS blocks the first launch, right-click the app in Finder and choose Open, or allow it in System Settings.

## Script Format

The script panel splits text by tags and maps each block to a page:

```text
[Cover]
Havoc in Heaven

[Author]
Anonymous

[Title]

[1]
Above the clouds, the golden staff shook the celestial palace.

[2]
The Monkey King stood at the edge of the cloud sea and saw distant halls stretching across the horizon.
```

- `[Cover]` or `[封面]` maps to page 0.
- `[Author]` or `[作者]` maps to the cover author credit.
- `[Title]` or `[扉页]` maps to the title page. When a title page exists, numbered body pages shift automatically.
- `[1]`, `[2]`, and other numeric tags map to body pages.

## Connect Codex

1. Open a project and select the robot icon in the toolbar.
2. Select `Install to Codex` and confirm. The app updates only the `storybook` entry in the Codex user configuration.
3. Restart Codex or open a new task, then keep Storybook Co-Editor running while using the `storybook` MCP service.

The same screen can copy an MCP configuration for another local client or rotate the access token. Existing clients must reconnect with the new configuration after a rotation.

## Local Development

Desktop app:

```sh
cd app
pnpm install
pnpm tauri dev
```

Chrome extension:

```sh
cd extension
pnpm install
pnpm dev
```

Then load `extension/dist` from `chrome://extensions`.

Run the project's maintained checks:

```sh
./scripts/check.sh
```

## Project Navigation

- [Architecture and module ownership](ARCHITECTURE.md)
- [Release workflow](RELEASE.md)
- [Third-party assets and licenses](THIRD_PARTY_NOTICES.md)
- [Desktop app guide](app/README.md)

## License

Storybook Co-Editor application code is licensed under the MIT License. Bundled fonts use their respective SIL Open Font License 1.1 terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
