# Manual Release Guide

This project uses a manual GitHub Release flow. macOS packaging stays local because Tauri desktop builds depend on the local macOS toolchain and signing/notarization choices.

## Release Checklist

1. Confirm the workspace is clean.

```bash
git status --short
```

2. Confirm all public versions match.

```bash
rg -n '"version": "1.1.2"|version = "1.1.2"|v1.1.2' \
  app/package.json \
  app/src-tauri/tauri.conf.json \
  app/src-tauri/Cargo.toml \
  extension/package.json \
  extension/public/manifest.json \
  app/src/EditorScreen.tsx \
  README.md
```

3. Build release artifacts.

```bash
./release.sh
```

The script writes artifacts to `release/`:

```text
storybook-co-editor_1.1.2_aarch64.dmg
storybook-co-editor.app
storybook-co-editor.app.zip
storybook-co-editor-extension-v1.1.2.zip
SHA256SUMS.txt
RELEASE_NOTES_v1.1.2.md
```

4. Smoke test the build.

- Open the DMG and launch the app.
- Create a new project and confirm the footer says the local bridge is connected.
- Load the extension from `extension/dist` in `chrome://extensions`.
- Send one image from a supported page to the desktop app.
- Export a small PDF from the print tab.

5. Create and push the version tag.

```bash
git tag -a v1.1.2 -m "Storybook Co-Editor v1.1.2"
git push origin main
git push origin v1.1.2
```

6. Create a draft GitHub Release.

```bash
gh release create v1.1.2 \
  release/storybook-co-editor_1.1.2_aarch64.dmg \
  release/storybook-co-editor.app.zip \
  release/storybook-co-editor-extension-v1.1.2.zip \
  release/SHA256SUMS.txt \
  --repo glenzli/storybook-co-editor \
  --title "Storybook Co-Editor v1.1.2" \
  --notes-file release/RELEASE_NOTES_v1.1.2.md \
  --draft
```

7. Review the draft release in GitHub, then publish it manually.

## Notes For Users

The current macOS build is not notarized. If macOS blocks the first launch, open the app from Finder with right-click > Open, or allow it in System Settings.

The Chrome extension package is not published through the Chrome Web Store. Users should unzip it, open `chrome://extensions`, enable Developer Mode, and load the unzipped folder.

CMYK PDF conversion requires Ghostscript:

```bash
brew install ghostscript
```
