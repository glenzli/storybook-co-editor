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
require_cmd codesign

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

echo "📄 Copying license notices..."
LICENSE_DIR="$RELEASE_DIR/licenses"
FONT_LICENSE_DIR="$LICENSE_DIR/fonts"
DEPENDENCY_LICENSE_DIR="$LICENSE_DIR/dependencies"
mkdir -p "$FONT_LICENSE_DIR"
mkdir -p "$DEPENDENCY_LICENSE_DIR"
cp "$ROOT_DIR/LICENSE" "$LICENSE_DIR/LICENSE"
cp "$ROOT_DIR/THIRD_PARTY_NOTICES.md" "$LICENSE_DIR/THIRD_PARTY_NOTICES.md"
find "$ROOT_DIR/app/src/assets/fonts" -name "OFL-*.txt" -exec cp {} "$FONT_LICENSE_DIR/" \;
find "$ROOT_DIR/app/src/assets/licenses" -name "*.txt" -exec cp {} "$DEPENDENCY_LICENSE_DIR/" \;

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

echo "🔏 Applying an ad-hoc signature to the app bundle..."
codesign --force --deep --sign - "$APP_BUNDLE"
codesign --verify --deep --strict "$APP_BUNDLE"

cp -R "$APP_BUNDLE" "$RELEASE_DIR/"

APP_RELEASE_BUNDLE="$RELEASE_DIR/storybook-co-editor.app"
case "$(uname -m)" in
  arm64) TARGET_ARCH="aarch64" ;;
  x86_64) TARGET_ARCH="x64" ;;
  *) TARGET_ARCH="$(uname -m)" ;;
esac
DMG_NAME="storybook-co-editor_${VERSION}_${TARGET_ARCH}.dmg"

echo "💿 Creating simple DMG..."
DMG_STAGE=""
APP_ZIP_STAGE=""
cleanup() {
  if [[ -n "$DMG_STAGE" ]]; then
    rm -rf "$DMG_STAGE"
  fi
  if [[ -n "$APP_ZIP_STAGE" ]]; then
    rm -rf "$APP_ZIP_STAGE"
  fi
}
trap cleanup EXIT
DMG_STAGE="$(mktemp -d)"
cp -R "$APP_BUNDLE" "$DMG_STAGE/"
cp -R "$LICENSE_DIR" "$DMG_STAGE/licenses"
ln -s /Applications "$DMG_STAGE/Applications"
hdiutil create \
  -volname "Storybook Co-Editor" \
  -srcfolder "$DMG_STAGE" \
  -ov \
  -format UDZO \
  "$RELEASE_DIR/$DMG_NAME"

echo "🗜️  Creating app zip..."
APP_ZIP_STAGE="$(mktemp -d)"
cp -R "$APP_RELEASE_BUNDLE" "$APP_ZIP_STAGE/"
cp -R "$LICENSE_DIR" "$APP_ZIP_STAGE/licenses"
if command -v ditto >/dev/null 2>&1; then
  ditto -c -k --sequesterRsrc "$APP_ZIP_STAGE" "$RELEASE_DIR/storybook-co-editor.app.zip"
else
  cd "$APP_ZIP_STAGE"
  zip -qry "$RELEASE_DIR/storybook-co-editor.app.zip" "$(basename "$APP_RELEASE_BUNDLE")" "licenses" -x "*.DS_Store"
fi

echo "🗂️  Creating license notices zip..."
cd "$LICENSE_DIR"
zip -qry "$RELEASE_DIR/storybook-co-editor-licenses-v${VERSION}.zip" . -x "*.DS_Store"

echo "🧾 Writing checksums..."
cd "$RELEASE_DIR"
shasum -a 256 \
  "$DMG_NAME" \
  "storybook-co-editor-extension-v${VERSION}.zip" \
  "storybook-co-editor.app.zip" \
  "storybook-co-editor-licenses-v${VERSION}.zip" \
  > SHA256SUMS.txt

cat > "RELEASE_NOTES_v${VERSION}.md" <<EOF
## Storybook Co-Editor v${VERSION}

本次发布提供 macOS 桌面端和 Chrome 扩展手动安装包。

This release provides the macOS desktop app and a manually installed Chrome extension.

### 本次更新 / What's New

- 新增无效果、描边、柔光、绘画底纹和清晰面板五种正文可读性模式，强度可调，适应复杂绘本背景。
- 新增按页文本宽度控制，并可将位置、颜色、字体粗细和可读性设置同步到全部正文页。
- 新增悠哉字体、小赖字体和霞鹜文楷 Light；字体粗细会真实写入项目、预览、PDF 和网页出版包。
- 新增多语言项目与网页出版流程：不同语言共享画面资源，分别保存脚本、出版元数据和文字样式。
- 网页出版格式升级到字体包 2，冻结文本几何同时记录字体粗细与可读性效果。

- Added five body-text readability modes—none, outline, soft halo, painted wash, and clear panel—with adjustable strength for complex illustrated backgrounds.
- Added per-page text-width control and synchronization of position, color, font weight, and readability settings across body pages.
- Added Yozai, Xiaolai, and LXGW WenKai Light; actual font weights now persist through projects, preview, PDF, and web publication packages.
- Added multilingual projects and web publication: languages share artwork while keeping scripts, publication metadata, and text styles independent.
- Upgraded web publications to font pack 2, preserving font weight and readability effects with frozen text geometry.

### 下载内容 / Downloads

- \`$DMG_NAME\`: macOS 安装镜像，推荐普通用户下载。
- \`storybook-co-editor.app.zip\`: macOS App Bundle 压缩包，适合直接解压测试。
- \`storybook-co-editor-extension-v${VERSION}.zip\`: Chrome 扩展包，解压后通过开发者模式加载。
- \`storybook-co-editor-licenses-v${VERSION}.zip\`: 应用和内置字体的许可证与第三方 notice。
- \`SHA256SUMS.txt\`: 发布产物校验和。

### 安装说明 / Installation

**中文**

1. 安装并启动 macOS 桌面端。
2. 解压 Chrome 扩展包。
3. 打开 \`chrome://extensions\`，启用开发者模式，选择解压后的扩展目录加载。
4. 在支持的网页上悬停图片，使用“发送”按钮同步到桌面端。

**English**

1. Install and launch the macOS desktop app.
2. Unzip the Chrome extension package.
3. Open \`chrome://extensions\`, enable Developer Mode, and load the unzipped directory.
4. Hover over an image on a supported page and use **Send** to transfer it to the desktop app.

### 注意事项 / Notes

- 当前构建未包含 Apple notarization。macOS 首次打开时如果出现安全提示，请在 Finder 中右键打开，或到系统设置中允许打开。
- This build is not Apple-notarized. If macOS blocks the first launch, right-click the app in Finder and choose **Open**, or allow it in System Settings.
EOF

find "$RELEASE_DIR" -name ".DS_Store" -delete

echo "✅ Release build complete! All artifacts are in the 'release' directory."
ls -la "$RELEASE_DIR"
