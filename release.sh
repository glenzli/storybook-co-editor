#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$ROOT_DIR/release"
export CI="${CI:-true}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

json_version() {
  node -e "console.log(require(process.argv[1]).version)" "$1"
}

require_cmd node
require_cmd pnpm
require_cmd zip
require_cmd shasum
require_cmd hdiutil

APP_VERSION="$(json_version "$ROOT_DIR/app/package.json")"
TAURI_VERSION="$(json_version "$ROOT_DIR/app/src-tauri/tauri.conf.json")"
CARGO_VERSION="$(awk -F'"' '/^version =/ { print $2; exit }' "$ROOT_DIR/app/src-tauri/Cargo.toml")"
EXT_VERSION="$(json_version "$ROOT_DIR/extension/package.json")"
MANIFEST_VERSION="$(json_version "$ROOT_DIR/extension/public/manifest.json")"

if [[ "$APP_VERSION" != "$TAURI_VERSION" || "$APP_VERSION" != "$CARGO_VERSION" || "$APP_VERSION" != "$EXT_VERSION" || "$APP_VERSION" != "$MANIFEST_VERSION" ]]; then
  echo "Version mismatch:" >&2
  echo "  app/package.json: $APP_VERSION" >&2
  echo "  app/src-tauri/tauri.conf.json: $TAURI_VERSION" >&2
  echo "  app/src-tauri/Cargo.toml: $CARGO_VERSION" >&2
  echo "  extension/package.json: $EXT_VERSION" >&2
  echo "  extension/public/manifest.json: $MANIFEST_VERSION" >&2
  exit 1
fi

VERSION="$APP_VERSION"

echo "🧹 Cleaning up release directory..."
mkdir -p "$RELEASE_DIR"
find "$RELEASE_DIR" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

echo "📦 Building Chrome Extension..."
cd "$ROOT_DIR/extension"
pnpm install --frozen-lockfile --ignore-scripts=true
pnpm run build
cd dist
zip -qry "$RELEASE_DIR/storybook-co-editor-extension-v${VERSION}.zip" . -x "*.DS_Store"

echo "🚀 Building Tauri App..."
cd "$ROOT_DIR/app"
pnpm install --frozen-lockfile --ignore-scripts=true
pnpm tauri build --bundles app

echo "🚚 Copying Tauri App artifacts..."
APP_BUNDLE="$ROOT_DIR/app/src-tauri/target/release/bundle/macos/storybook-co-editor.app"

if [[ ! -d "$APP_BUNDLE" ]]; then
  echo "Missing app bundle: $APP_BUNDLE" >&2
  exit 1
fi

cp -R "$APP_BUNDLE" "$RELEASE_DIR/"

APP_RELEASE_BUNDLE="$RELEASE_DIR/storybook-co-editor.app"
case "$(uname -m)" in
  arm64) TARGET_ARCH="aarch64" ;;
  x86_64) TARGET_ARCH="x64" ;;
  *) TARGET_ARCH="$(uname -m)" ;;
esac
DMG_NAME="storybook-co-editor_${VERSION}_${TARGET_ARCH}.dmg"

echo "💿 Creating simple DMG..."
DMG_STAGE="$(mktemp -d)"
cleanup() {
  rm -rf "$DMG_STAGE"
}
trap cleanup EXIT
cp -R "$APP_BUNDLE" "$DMG_STAGE/"
ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create \
  -volname "Storybook Co-Editor" \
  -srcfolder "$DMG_STAGE" \
  -ov \
  -format UDZO \
  "$RELEASE_DIR/$DMG_NAME"

echo "🗜️  Creating app zip..."
if command -v ditto >/dev/null 2>&1; then
  ditto -c -k --sequesterRsrc --keepParent "$APP_RELEASE_BUNDLE" "$RELEASE_DIR/storybook-co-editor.app.zip"
else
  cd "$RELEASE_DIR"
  zip -qry "$RELEASE_DIR/storybook-co-editor.app.zip" "$(basename "$APP_RELEASE_BUNDLE")" -x "*.DS_Store"
fi

echo "🧾 Writing checksums..."
cd "$RELEASE_DIR"
shasum -a 256 \
  "$DMG_NAME" \
  "storybook-co-editor-extension-v${VERSION}.zip" \
  "storybook-co-editor.app.zip" \
  > SHA256SUMS.txt

cat > "RELEASE_NOTES_v${VERSION}.md" <<EOF
## Storybook Co-Editor v${VERSION}

本次发布提供 macOS 桌面端和 Chrome 扩展手动安装包。

### 下载内容

- \`$DMG_NAME\`: macOS 安装镜像，推荐普通用户下载。
- \`storybook-co-editor.app.zip\`: macOS App Bundle 压缩包，适合直接解压测试。
- \`storybook-co-editor-extension-v${VERSION}.zip\`: Chrome 扩展包，解压后通过开发者模式加载。
- \`SHA256SUMS.txt\`: 发布产物校验和。

### 安装说明

1. 安装并启动 macOS 桌面端。
2. 解压 Chrome 扩展包。
3. 打开 \`chrome://extensions\`，启用开发者模式，选择解压后的扩展目录加载。
4. 在支持的网页上悬停图片，使用“发送”按钮同步到桌面端。

### 注意事项

- 当前构建未包含 Apple notarization。macOS 首次打开时如果出现安全提示，请在 Finder 中右键打开，或到系统设置中允许打开。
EOF

find "$RELEASE_DIR" -name ".DS_Store" -delete

echo "✅ Release build complete! All artifacts are in the 'release' directory."
ls -la "$RELEASE_DIR"
