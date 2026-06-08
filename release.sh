#!/usr/bin/env bash
set -e

echo "🧹 Cleaning up release directory..."
mkdir -p release
rm -rf release/*

echo "📦 Building Chrome Extension..."
cd extension
pnpm install
pnpm run build
cd dist
EXT_VERSION=$(grep '"version"' ../package.json | head -1 | awk -F'"' '{print $4}')
zip -r ../../release/storybook-co-editor-extension-v${EXT_VERSION}.zip . > /dev/null
cd ../../

echo "🚀 Building Tauri App..."
cd app
pnpm install
pnpm tauri build
APP_VERSION=$(grep '"version"' src-tauri/tauri.conf.json | head -1 | awk -F'"' '{print $4}')

echo "🚚 Copying Tauri App artifacts..."
cp -r src-tauri/target/release/bundle/macos/storybook-co-editor.app ../release/
cp src-tauri/target/release/bundle/dmg/*.dmg ../release/
cd ..

echo "✅ Release build complete! All artifacts are in the 'release' directory."
ls -la release/
