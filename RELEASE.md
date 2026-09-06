# Manual Release Guide

This project publishes releases on GitHub and mirrors the source branch to GitLab. macOS packaging stays local because Tauri desktop builds depend on the local macOS toolchain and signing/notarization choices.

## Release Checklist

1. Confirm the workspace is clean.

```bash
git status --short
```

2. Confirm all public versions match.

```bash
rg -n '"version": "1.4.0"|version = "1.4.0"|v1.4.0' \
  app/package.json \
  app/src-tauri/tauri.conf.json \
  app/src-tauri/Cargo.toml \
  extension/package.json \
  extension/public/manifest.json \
  app/src/EditorScreen.tsx \
  README.md \
  README.en.md
```

3. Build release artifacts.

```bash
./release.sh
```

The script writes artifacts to `release/`:

```text
storybook-co-editor_1.4.0_aarch64.dmg
storybook-co-editor.app
storybook-co-editor.app.zip
storybook-co-editor-extension-v1.4.0.zip
storybook-co-editor-licenses-v1.4.0.zip
SHA256SUMS.txt
RELEASE_NOTES_v1.4.0.md
```

4. Smoke test the build.

- Open the DMG and launch the app.
- Create a new project and confirm the footer says the local bridge is connected.
- Load the extension from `extension/dist` in `chrome://extensions`.
- Send one image from a supported page to the desktop app.
- Open the publication metadata dialog, save a title and identifier, then reopen it to confirm persistence.
- Select each copyright-page mode and confirm the electronic and print page counts update as expected.
- Clear publication metadata and confirm both PDF exports offer configure, continue, and cancel actions.
- Export an electronic PDF with the screen-publishing preset and confirm printing, copying, and modification are disallowed.
- Export an electronic PDF with an open password and confirm the correct password opens it.
- Export an unencrypted electronic PDF with the open-reading preset.
- Export a small print PDF from the print tab.

5. Push the release commit to both source remotes.

```bash
git push gitlab main
git push github main
```

6. Create the GitHub tag and Release with one CLI invocation. Set `RELEASE_COMMIT` to the exact commit SHA that was pushed to both remotes.

```bash
RELEASE_COMMIT="$(git rev-parse HEAD)"
gh release create v1.4.0 \
  release/storybook-co-editor_1.4.0_aarch64.dmg \
  release/storybook-co-editor.app.zip \
  release/storybook-co-editor-extension-v1.4.0.zip \
  release/storybook-co-editor-licenses-v1.4.0.zip \
  release/SHA256SUMS.txt \
  --repo glenzli/storybook-co-editor \
  --title "Storybook Co-Editor v1.4.0" \
  --notes-file release/RELEASE_NOTES_v1.4.0.md \
  --target "$RELEASE_COMMIT"
```

7. Review the GitHub release and confirm both remote `main` branches point to the release commit.

## Notes For Users

The current macOS build is not notarized. If macOS blocks the first launch, open the app from Finder with right-click > Open, or allow it in System Settings.

The Chrome extension package is not published through the Chrome Web Store. Users should unzip it, open `chrome://extensions`, enable Developer Mode, and load the unzipped folder.
