#!/usr/bin/env bash
# =============================================================================
# run-product-tests.sh — Integration tests for the product control plane
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_DIR="$ROOT/product/api"
TEST_DB="rmail_product_test"
TEST_PORT=5433

echo "=== Starting test PostgreSQL ==="
docker rm -f rmail-product-test-db 2>/dev/null || true
docker run -d --name rmail-product-test-db \
  -e POSTGRES_DB="$TEST_DB" \
  -e POSTGRES_USER=product \
  -e POSTGRES_PASSWORD=product \
  -p "127.0.0.1:${TEST_PORT}:5432" \
  postgres:16-alpine

echo "Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker exec rmail-product-test-db pg_isready -U product > /dev/null 2>&1; then
    break
  fi
  sleep 1
done

export DATABASE_URL="postgresql://product:product@127.0.0.1:${TEST_PORT}/${TEST_DB}"
export JWT_SECRET="test-jwt-secret"
export NODE_ENV="test"
unset STRIPE_SECRET_KEY

cd "$API_DIR"
npx prisma migrate deploy
npm run build

echo "=== Running integration tests ==="
node --import tsx --test src/test/integration.test.ts

echo "=== Running shell script syntax checks ==="
bash -n "$ROOT/scripts/setup-org.sh"
bash -n "$ROOT/scripts/provision-pilot-orgs.sh"

echo "=== Validating docker-compose configs ==="
if docker compose version > /dev/null 2>&1; then
  docker compose -f "$ROOT/docker-compose.yml" config > /dev/null
  docker compose -f "$ROOT/product/docker-compose.yml" config > /dev/null
elif command -v docker-compose > /dev/null 2>&1; then
  docker-compose -f "$ROOT/docker-compose.yml" config > /dev/null
  docker-compose -f "$ROOT/product/docker-compose.yml" config > /dev/null
else
  echo "WARN: docker compose not available — skipping compose validation"
fi

echo ""
echo "✅ All product tests passed"

docker rm -f rmail-product-test-db > /dev/null 2>&1 || true
