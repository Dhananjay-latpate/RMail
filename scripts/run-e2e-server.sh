#!/usr/bin/env bash
# Start a local RMail instance for browser E2E (SQLite, no Docker).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
E2E_DIR="${E2E_DATA_DIR:-$ROOT/.e2e-data}"
ADMIN_SECRET="${ADMIN_SECRET:-e2e-admin-secret}"
MAIL_HOSTNAME="${MAIL_HOSTNAME:-localhost}"
if [[ -x "$ROOT/target/debug/stalwart" ]]; then
  STALWART_BIN="${STALWART_BIN:-$ROOT/target/debug/stalwart}"
elif [[ -x "$ROOT/target/debug/stalwart.exe" ]]; then
  STALWART_BIN="${STALWART_BIN:-$ROOT/target/debug/stalwart.exe}"
else
  STALWART_BIN="${STALWART_BIN:-$ROOT/target/debug/stalwart}"
fi

if [[ ! -x "$STALWART_BIN" ]]; then
  echo "Building stalwart (debug)…"
  cargo build -p stalwart --no-default-features --features "sqlite enterprise" --manifest-path "$ROOT/Cargo.toml"
fi

if [[ ! -f "$E2E_DIR/etc/config.toml" ]]; then
  echo "Initializing RMail at $E2E_DIR"
  rm -rf "$E2E_DIR"
  "$STALWART_BIN" --init "$E2E_DIR"
  sed -i \
    -e 's/data = "rocksdb"/data = "sqlite"/' \
    -e 's/fts = "rocksdb"/fts = "sqlite"/' \
    -e 's/blob = "rocksdb"/blob = "sqlite"/' \
    -e 's/lookup = "rocksdb"/lookup = "sqlite"/' \
    -e 's/\[store\.rocksdb\]/[store.sqlite]/' \
    -e 's/type = "rocksdb"/type = "sqlite"/' \
    -e 's|path = "'"$E2E_DIR"'/data"|path = "'"$E2E_DIR"'/data/stalwart.db"|' \
    -e 's/store = "rocksdb"/store = "sqlite"/' \
    "$E2E_DIR/etc/config.toml"
  {
    echo ""
    echo "[http]"
    echo "permissive-cors = true"
    echo ""
    echo "[server]"
    echo "hostname = \"${MAIL_HOSTNAME}\""
    echo ""
    echo "[lookup]"
    echo "default.hostname = \"${MAIL_HOSTNAME}\""
    echo ""
    echo "[spam-filter]"
    echo "enable = false"
    echo ""
    if [[ "$(uname -s 2>/dev/null)" == MINGW* || "$(uname -s 2>/dev/null)" == MSYS* ]]; then
      echo "config.resource.spam-filter = \"file:///NUL\""
    else
      echo "config.resource.spam-filter = \"file:///dev/null\""
    fi
  } >> "$E2E_DIR/etc/config.toml"
  if grep -q '^secret =' "$E2E_DIR/etc/config.toml"; then
    sed -i "s/^secret =.*/secret = \"${ADMIN_SECRET}\"/" "$E2E_DIR/etc/config.toml"
  fi
fi

export ADMIN_SECRET
echo "Starting RMail on http://localhost:8080 (data: $E2E_DIR)"
exec "$STALWART_BIN" --config "$E2E_DIR/etc/config.toml"
