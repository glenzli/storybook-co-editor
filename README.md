# 📖 Storybook Co-Editor 

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.1.2-blue.svg?cacheSeconds=2592000" />
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2.0-FFC131?logo=tauri&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.77-000000?logo=rust&logoColor=white" />
</p>

[English](#english) | [中文](#chinese)

---

<h2 id="english">🇬🇧 English</h2>

**Storybook Co-Editor** is an advanced desktop toolkit designed to extract, orchestrate, fine-tune, and export AI-generated or web-based storybooks into professional print-ready PDFs. It consists of a **Chrome Extension** for data capturing and a **Tauri Desktop Application** for professional layout and image processing.

### ✨ Core Features

#### 🔍 1. Web Extraction (Chrome Extension)
- Seamlessly extract storybook illustrations, text sequences, and metadata directly from web interfaces.
- Synchronizes extracted data straight into the desktop editor's workspace.

#### 🎨 2. Professional Visual Editor
- **Drag-and-Drop Workflow**: Intuitive page reordering and layout management.
- **Structural Segregation**: Auto-identification of Cover, Title, and Inner pages.
- **Smart Text Overlays**: Adjustable font scaling, dynamic wrapping, multi-stroke readability, and precise XY offset controls.
- **Pagination Control**: Insert virtual blank pages (`blank://`) to fulfill printer-specific page counts.

#### 📸 3. Pro-Grade Image Engine (New)
Built-in advanced image tuning capabilities to perfect AI-generated illustrations:
- **Tone & Light**: Exposure, Brightness, Contrast, Highlights, and Shadows recovery.
- **Color Grading**: Saturation, Temperature (White Balance), and Tint controls.
- **Selective Color Adjustment**: Target and modify specific hues in the image without affecting the rest.
- **Intelligent Chroma Keying (Background Removal)**: Utilize RGB Euclidean distance algorithms to extract and remove specific background colors (e.g., removing faint grey/yellow backgrounds from AI images), supporting tolerance adjustments for perfect edge blending.

#### 🖨 4. Print-Ready PDF Export
- **Canvas 2D Rendering**: Pixel-perfect text rendering and auto-wrapping via Canvas API during export.
- **Binding Modes**: Supports Saddle Stitch, Perfect Binding, and Butterfly Binding.
- **Pre-Press Capabilities**: Automatic generation of crop marks, binding margins, and hardware bleeds. Supports 1-up or 2-up layouts.

### 🚀 Build & Release

Use the provided shell script to build both the Chrome extension and the macOS desktop app. Artifacts will be generated in the `release/` folder.

```bash
# Grant execution permissions
chmod +x release.sh

# Build all components
./release.sh
```

**Output Artifacts:**
1. `storybook-co-editor.app` - macOS App Bundle
2. `storybook-co-editor_1.1.2_aarch64.dmg` - macOS Installer
3. `storybook-co-editor-extension-v1.1.2.zip` - Chrome Extension Package

---

<h2 id="chinese">🇨🇳 中文</h2>

**Storybook Co-Editor (绘本协同排版工具)** 是一个专为 AI 绘本和网页端绘本内容设计的专业级桌面排版引擎。它可以将网页上的绘本内容一键提取，在本地桌面端进行专业级的图像调色、图文排版，并最终导出为符合工业印刷标准的 PDF 文件。

系统包含 **Chrome 浏览器扩展**与 **Tauri 桌面端应用** 两个部分。

### ✨ 核心功能

#### 🔍 1. 内容智能抓取（Chrome 扩展）
- 从网页端一键提取绘本的插图、文本序列与元数据。
- 与桌面端无缝通信，抓取后直接在桌面端可视化面板中打开。

#### 🎨 2. 可视化图文排版
- **丝滑工作流**：支持拖拽排序、封面与扉页自动识别与分离。
- **智能排版系统**：基于 Canvas API 的高精度文本渲染，支持字号缩放、智能换行、相对偏移调整、多重描边与阴影设置（确保复杂背景下的文字可读性）。
- **灵活分页**：支持插入虚拟空白页（`blank://`）以补齐印刷所需的印张页数。

#### 📸 3. 专业级图像引擎 (New)
专为 AI 绘图不确定性设计的内置图像处理引擎，告别频繁在 PS 中修图：
- **光影重塑**：支持曝光度 (Gamma 曲线)、亮度、对比度、高光与阴影恢复。
- **色彩校准**：饱和度、色温 (白平衡)、色调调节。
- **可选颜色 (Selective Color)**：精准定位并修改画面中的特定色彩范围。
- **智能抠除底色 (Chroma Keying)**：基于 RGB 欧几里得距离（Euclidean Distance）的高级背景消除算法。可**自定义目标底色**，完美解决 AI 生图边缘泛黄/泛灰的杂色底问题，支持抠除强度与边缘平滑调节。

#### 🖨 4. 工业级 PDF 导出
- **极致清晰**：生成超清分辨率 PDF，所见即所得。
- **拼版模式**：支持单页导出与双页拼版（1-up / 2-up）。
- **印前设置**：支持骑马钉、无线胶装、蝴蝶对裱等主流装订模式。
- **自动化裁切**：自动计算刷胶区留白、生成印刷裁剪线（Crop Marks）、支持硬件级出血线设置。

### 🚀 构建与发布

通过根目录的脚本，可以一键同时打包 Chrome 插件并编译 Tauri 桌面端，产物将统一输出至 `release/` 目录。

```bash
# 添加执行权限
chmod +x release.sh

# 运行全量构建
./release.sh
```

**构建产物分布：**
1. `storybook-co-editor.app` - macOS 主程序包
2. `storybook-co-editor_1.1.2_aarch64.dmg` - macOS 独立安装包
3. `storybook-co-editor-extension-v1.1.2.zip` - Chrome 插件压缩包
