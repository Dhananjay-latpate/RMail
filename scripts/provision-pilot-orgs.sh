#!/usr/bin/env bash
# =============================================================================
# provision-pilot-orgs.sh - Create two pilot organizations for smoke testing
# =============================================================================
#
# Prerequisites:
#   - RMail running (docker compose up -d)
#   - ENTERPRISE_LICENSE_KEY configured in .env
#   - ADMIN_SECRET set
#
# Usage:
#   ./scripts/provision-pilot-orgs.sh [--server http://localhost:8080]
# =============================================================================

set -euo pipefail

SERVER_URL="${1:-http://localhost:8080}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Waiting for RMail health check..."
for i in $(seq 1 30); do
    if curl -sf "${SERVER_URL}/healthz/live" > /dev/null 2>&1; then
        echo "RMail is ready."
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "Error: RMail did not become healthy in time."
        exit 1
    fi
    sleep 2
done

echo ""
echo "=== Provisioning Pilot Org 1: Acme Corp ==="
"$SCRIPT_DIR/setup-org.sh" \
    --server "$SERVER_URL" \
    --domain "acme-pilot.local" \
    --org "Acme Corp Pilot" \
    --tenant "acme-pilot" \
    --admin "admin@acme-pilot.local" \
    --password "PilotAcme123!" \
    --brand "Acme Mail" \
    --quota 10737418240

echo ""
echo "=== Provisioning Pilot Org 2: Beta Industries ==="
"$SCRIPT_DIR/setup-org.sh" \
    --server "$SERVER_URL" \
    --domain "beta-pilot.local" \
    --org "Beta Industries Pilot" \
    --tenant "beta-pilot" \
    --admin "admin@beta-pilot.local" \
    --password "PilotBeta123!" \
    --brand "Beta Mail" \
    --quota 10737418240

echo ""
echo "=== Creating DKIM for pilot domains ==="
AUTH="Authorization: Basic $(echo -n "admin:${ADMIN_SECRET}" | base64)"

for domain in acme-pilot.local beta-pilot.local; do
    echo "DKIM for $domain..."
    curl -s -X POST \
        -H "$AUTH" \
        -H "Content-Type: application/json" \
        -d "{\"domain\":\"$domain\",\"algorithm\":\"Ed25519\"}" \
        "${SERVER_URL}/api/manage/dkim" | python3 -m json.tool 2>/dev/null || true
done

echo ""
echo "=== Pilot provisioning complete ==="
echo "Verify tenant isolation:"
echo "  1. Login as admin@acme-pilot.local — should only see Acme users"
echo "  2. Login as admin@beta-pilot.local — should only see Beta users"
echo "  3. Send test mail between orgs via SMTP submission on port 587"
