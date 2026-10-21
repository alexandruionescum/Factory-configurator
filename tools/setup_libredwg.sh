#!/usr/bin/env bash
# Build libredwg (dwgread / dwgwrite) from source and install Python deps.
# Usage: source tools/setup_libredwg.sh   (exports DWGREAD / DWGWRITE)
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN="$ROOT/.local/bin"
if [ ! -x "$BIN/dwgwrite" ]; then
  SRC="$ROOT/.local/libredwg-src"
  [ -d "$SRC" ] || git clone -q --depth 1 https://github.com/LibreDWG/libredwg.git "$SRC"
  git -C "$SRC" submodule update --init --depth 1 -q
  cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release > /dev/null
  cmake --build "$SRC/build" -j"$(nproc)" --target dwgread dwgwrite > /dev/null
  mkdir -p "$BIN"
  cp "$SRC/build/dwgread" "$SRC/build/dwgwrite" "$SRC"/build/libredwg.so* "$BIN/"
fi
pip install -q numpy matplotlib lxml openpyxl
export DWGREAD="$BIN/dwgread" DWGWRITE="$BIN/dwgwrite"
export LD_LIBRARY_PATH="$BIN:${LD_LIBRARY_PATH:-}"
echo "dwgread: $("$DWGREAD" --version | head -1)"
