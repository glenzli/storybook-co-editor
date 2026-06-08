# Storybook Co-Editor

[English](#english) | [中文](#chinese)

<h2 id="english">English</h2>

**Storybook Co-Editor** is a toolkit designed to extract, arrange, and export storybooks into print-ready PDFs. It consists of a **Chrome Extension** and a **Tauri Desktop Application**.

### Features
- **Capture (Chrome Extension)**: Extract storybook images, text sequences, and metadata from web pages.
- **Layout Editor (Tauri App)**: 
  - Drag-and-drop page reordering.
  - Separation of Cover, Title, and Content pages.
  - Virtual blank pages (`blank://`) for pagination.
  - Text scaling, offsets, strokes, and shadows for readability.
- **PDF Export**: 
  - Generate high-resolution PDFs.
  - Supports Saddle Stitch, Perfect Binding, and Butterfly Binding.
  - Automatic crop marks, binding margins, and hardware bleeds.
  - 1-up or 2-up layouts.

### Build & Release

Use the provided script to build both the Chrome extension and the macOS desktop app. The artifacts will be placed in the `release` folder.

```bash
# Add execution permission
chmod +x release.sh

# Build release
./release.sh
```

**Artifacts generated:**
1. `storybook-co-editor.app` - macOS application
2. `storybook-co-editor_x.x.x_aarch64.dmg` - macOS disk image installer
3. `storybook-co-editor-extension-vx.x.x.zip` - Chrome extension package

---

<h2 id="chinese">中文</h2>

**Storybook Co-Editor** 是一个绘本协同排版工具，用于从网页提取绘本内容并在本地进行图文排版，最终导出为可供印刷的 PDF 文件。系统包含 **Chrome 浏览器扩展**与 **Tauri 桌面端应用** 两个部分。

### 核心功能
- **内容抓取（Chrome 扩展）**：从网页端提取绘本的插图、文本序列与排版数据，同步至桌面端。
- **可视化排版（Tauri 应用）**：
  - 支持拖拽排序、封面与扉页识别。
  - 支持插入虚拟空白页（`blank://`）以补齐打印页数。
  - 文本排版支持字号缩放、相对偏移调整、多重描边与阴影设置。
- **PDF 导出**：
  - 生成高清 PDF，支持单页与双页拼版（1-up / 2-up）。
  - 支持骑马钉、无线胶装、蝴蝶对裱等装订模式。
  - 支持自定义刷胶区留白、生成印刷裁剪线（双面打印时背面自动隐藏）。

### 构建与发布

通过根目录的脚本，可以同时打包 Chrome 插件并编译 Tauri 桌面端，产物将统一输出至 `release/` 目录。

```bash
# 添加执行权限
chmod +x release.sh

# 运行构建
./release.sh
```

**构建产物：**
1. `storybook-co-editor.app` - macOS 主程序
2. `storybook-co-editor_x.x.x_aarch64.dmg` - macOS 安装包
3. `storybook-co-editor-extension-vx.x.x.zip` - Chrome 插件包
