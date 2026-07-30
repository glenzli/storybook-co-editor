#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCOPE="${1:-all}"

check_frontend() {
  node "$ROOT_DIR/scripts/check-architecture.mjs"
  pnpm --dir "$ROOT_DIR/app" lint
  pnpm --dir "$ROOT_DIR/app" typecheck
  pnpm --dir "$ROOT_DIR/app" test
  pnpm --dir "$ROOT_DIR/app" build
  pnpm --dir "$ROOT_DIR/extension" typecheck
  pnpm --dir "$ROOT_DIR/extension" build
}

check_rust() {
  cargo fmt --manifest-path "$ROOT_DIR/app/src-tauri/Cargo.toml" -- --check
  cargo test --manifest-path "$ROOT_DIR/app/src-tauri/Cargo.toml"
}

case "$SCOPE" in
  frontend)
    check_frontend
    ;;
  rust)
    check_rust
    ;;
  all)
    check_frontend
    check_rust
    ;;
  *)
    echo "Usage: $0 [frontend|rust|all]" >&2
    exit 2
    ;;
esac
