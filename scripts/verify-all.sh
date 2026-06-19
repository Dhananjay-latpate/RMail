#!/usr/bin/env bash
# =============================================================================
# verify-all.sh — Run all concrete verification checks before production
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FAILED=0

run() {
  echo ""
  echo ">>> $1"
  if eval "$2"; then
    echo "✅ PASS: $1"
  else
    echo "❌ FAIL: $1"
    FAILED=$((FAILED + 1))
  fi
}

echo "=============================================="
echo " RMail Workspace — Full Verification Suite"
echo "=============================================="

run "Rust toolchain" "cd '$ROOT' && rustc --version"
run "RMail compile (enterprise)" "cd '$ROOT' && cargo check -p stalwart --no-default-features --features 'sqlite postgres enterprise'"
run "Product API TypeScript build" "cd '$ROOT/product/api' && npm run build"
run "Product portal build" "cd '$ROOT/product/portal' && npm run build"
run "Product webmail build" "cd '$ROOT/product/webmail' && npm run build"
run "Shell script syntax" "bash -n '$ROOT/scripts/setup-org.sh' && bash -n '$ROOT/scripts/provision-pilot-orgs.sh' && bash -n '$ROOT/scripts/run-product-tests.sh'"
run "Product API integration tests" "'$ROOT/scripts/run-product-tests.sh'"

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "=============================================="
  echo "✅ ALL VERIFICATION CHECKS PASSED ($FAILED failures)"
  echo "=============================================="
  exit 0
else
  echo "=============================================="
  echo "❌ $FAILED CHECK(S) FAILED — fix before production"
  echo "=============================================="
  exit 1
fi
