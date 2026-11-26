#!/bin/sh
# 可选辅助脚本：若仓库内存在本地 Rust 工具链（.cargo/.rustup），优先使用它。
# 常规开发直接使用系统的 rustup / cargo 即可，无需执行本脚本。
ROOT="$(cd "$(dirname "$0")" && pwd)"
if [ -d "$ROOT/.rustup" ]; then
  export RUSTUP_HOME="$ROOT/.rustup"
fi
if [ -d "$ROOT/.cargo" ]; then
  export CARGO_HOME="$ROOT/.cargo"
  export PATH="$ROOT/.cargo/bin:$PATH"
fi
