# Storybook Co-Editor

<p align="center">
  <img alt="Version" src="https://img.shields.io/badge/version-1.1.2-blue.svg?cacheSeconds=2592000" />
  <img alt="Tauri" src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=white" />
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
  <img alt="Rust" src="https://img.shields.io/badge/Rust-1.77-000000?logo=rust&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green.svg" />
</p>

Storybook Co-Editor 是一套面向 AI 绘本和网页绘本内容的本地协同排版工具。它由 Chrome 扩展和 Tauri 桌面端组成：扩展负责从网页里捕获插图，桌面端负责分页整理、图文排版、图像微调和印前 PDF 导出。

当前版本：`1.1.2`

## 预览

**桌面端编辑器**

<img src="docs/images/app-editor.png" alt="Storybook Co-Editor desktop editor" width="100%" />

**Chrome 扩展网页浮层**

<img src="docs/images/extension-overlay.png" alt="Storybook Co-Editor Chrome extension overlay" width="560" />

## 主要能力

- 网页采集：在 ChatGPT、OpenAI、Discord、Midjourney、Gemini 等页面悬停大图后，可直接发送到本地编辑器。
- 绘本分页：支持页面拖拽排序、移动到顶部/底部、删除、恢复、复制和导出原图。
- 文本脚本：使用 `[Cover]`、`[Title]`、`[Author]`、`[1]` 等标签维护整本绘本文字。
- 图文排版：分别调整封面、扉页、正文和作者署名的字体、字号、颜色、描边、底板和 XY 偏移。
- 图像微调：支持曝光、亮度、对比度、高光、阴影、饱和度、色温、色调、局部 HSL 和指定底色抠除。
- 印前拼版：支持骑马钉、无线胶装、蝴蝶对裱，支持 1-up/2-up、裁切线、胶装边距和硬件边距。
- 项目管理：项目保存为 `.scproj`，内含 `project.json`、图片资源和回收站内容。

## 工作流

```mermaid
flowchart LR
  A["网页绘本 / AI 生成页面"] --> B["Chrome 扩展捕获图片"]
  B --> C["本地服务 127.0.0.1:14320"]
  C --> D["Tauri 桌面编辑器"]
  D --> E["分页 / 文本 / 图像微调"]
  E --> F["印前拼版"]
  F --> G["PDF 导出"]
```

## 仓库结构

```text
.
├── app/                 # Tauri 桌面端：React 前端 + Rust 后端
│   ├── src/             # 编辑器、拼版、组件和图像处理逻辑
│   └── src-tauri/       # 本地 HTTP 服务、项目管理、PDF/CMYK 能力
├── extension/           # Chrome Manifest V3 扩展
│   ├── src/content.ts   # 网页注入层：图片浮层、发送、参考图
│   └── src/background.ts# 转发图片到本地桌面端
├── docs/images/         # README 截图资源
├── release/             # 构建产物输出目录
└── release.sh           # 一键构建扩展和 macOS 桌面端
```

## 本地开发

### 桌面端

```bash
cd app
pnpm install
pnpm tauri dev
```

桌面端启动后会开启本地服务：

```text
http://127.0.0.1:14320
```

扩展会通过这个地址把图片和批次状态同步给桌面端。

### Chrome 扩展

```bash
cd extension
pnpm install
pnpm dev
```

然后在 Chrome 打开 `chrome://extensions`，启用开发者模式，选择 `extension/dist` 作为 unpacked extension 加载。

## 脚本文本格式

编辑器右侧脚本区按标签拆分文字并映射到页面：

```text
[Cover]
Dr. Stochastic Parrot

[Author]
by Storybook Co-Editor

[Title]
关于随机鹦鹉博士的故事

[1]
森林深处，住着一位喜欢研究概率的鹦鹉博士。

[2]
他每天都会记录风、羽毛和机械齿轮之间的奇妙关系。
```

说明：

- `[Cover]` 映射封面。
- `[Author]` 映射封面作者署名。
- `[Title]` 映射扉页；如果存在扉页，正文页码会自动后移。
- `[1]`、`[2]` 等数字标签映射正文页。

## 构建发布

根目录提供了一键构建脚本，会同时打包 Chrome 扩展和 macOS 桌面端，产物输出到 `release/`。

```bash
chmod +x release.sh
./release.sh
```

预期产物：

```text
release/storybook-co-editor.app
release/storybook-co-editor_1.1.2_aarch64.dmg
release/storybook-co-editor-extension-v1.1.2.zip
```

## 技术栈

- Desktop: Tauri 2, Rust, Axum, Tokio
- Frontend: React 19, Vite, TypeScript, Tailwind CSS
- Extension: Chrome Manifest V3, TypeScript, Vite
- Export: html2canvas, jsPDF, Ghostscript CMYK conversion

## License

MIT
