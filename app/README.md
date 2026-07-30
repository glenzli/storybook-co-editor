# Storybook Co-Editor Desktop App

[简体中文项目文档](../README.md) · [English project documentation](../README.en.md)

This directory contains the Tauri 2 desktop application:

- `src/`: React, TypeScript, editor UI, page rendering, and PDF export.
- `src-tauri/`: Rust commands, project storage, the local image bridge, and PDF security.

## Development

```bash
pnpm install
pnpm tauri dev
```

Run frontend checks from this directory:

```bash
pnpm lint
pnpm build
```

Run Rust tests from `src-tauri/`:

```bash
cargo test
```

Release packaging is managed by [`../release.sh`](../release.sh). See the root
[README](../README.md) and [release guide](../RELEASE.md) for the complete workflow.
