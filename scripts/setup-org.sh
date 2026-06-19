#!/usr/bin/env bash
# =============================================================================
# setup-org.sh - Onboard a new client organization to RMail
# =============================================================================
#
# Uses the one-call organization/provision Management API endpoint.
#
# Usage:
#   ./scripts/setup-org.sh \
#     --domain "clientA.com" \
#     --org    "Client A Inc." \
#     --admin  "admin@clientA.com" \
#     --password "SecurePass123!"
#
# Options:
#   --domain      Primary email domain (required)
#   --org         Organization display name (required)
#   --admin       Admin email address (required)
#   --password    Admin password (required)
#   --tenant      Tenant slug (default: org name lowercased, spaces to hyphens)
#   --server      Mail server URL (default: http://localhost:8080)
#   --superadmin  Super-admin username (default: admin)
#   --secret      Super-admin password (default: ADMIN_SECRET env var)
#   --quota       Disk quota in bytes (default: 10737418240 = 10GB)
#   --brand       Brand display name (default: org name)
#   --help        Show this help message
# =============================================================================

set -euo pipefail

SERVER_URL="http://localhost:8080"
SUPERADMIN_USER="admin"
SUPERADMIN_PASS="${ADMIN_SECRET:-}"
QUOTA=10737418240

DOMAIN=""
ORG_NAME=""
ADMIN_EMAIL=""
ADMIN_PASS=""
TENANT_NAME=""
BRAND_NAME=""

usage() {
    echo "Usage: $0 --domain <domain> --org <name> --admin <email> --password <pass>"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)     DOMAIN="$2";          shift 2 ;;
        --org)        ORG_NAME="$2";        shift 2 ;;
        --admin)      ADMIN_EMAIL="$2";     shift 2 ;;
        --password)   ADMIN_PASS="$2";      shift 2 ;;
        --tenant)     TENANT_NAME="$2";     shift 2 ;;
        --server)     SERVER_URL="$2";      shift 2 ;;
        --superadmin) SUPERADMIN_USER="$2"; shift 2 ;;
        --secret)     SUPERADMIN_PASS="$2"; shift 2 ;;
        --quota)      QUOTA="$2";           shift 2 ;;
        --brand)      BRAND_NAME="$2";      shift 2 ;;
        --help)       usage ;;
        *)            echo "Unknown option: $1"; usage ;;
    esac
done

if [[ -z "$DOMAIN" || -z "$ORG_NAME" || -z "$ADMIN_EMAIL" || -z "$ADMIN_PASS" ]]; then
    echo "Error: --domain, --org, --admin, and --password are required."
    usage
fi

if [[ -z "$SUPERADMIN_PASS" ]]; then
    echo "Error: Set ADMIN_SECRET or pass --secret."
    exit 1
fi

if [[ -z "$TENANT_NAME" ]]; then
    TENANT_NAME="$(echo "$ORG_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-')"
fi

if [[ -z "$BRAND_NAME" ]]; then
    BRAND_NAME="$ORG_NAME"
fi

ADMIN_NAME="$(echo "$ADMIN_EMAIL" | cut -d'@' -f1)"
AUTH_HEADER="Authorization: Basic $(echo -n "${SUPERADMIN_USER}:${SUPERADMIN_PASS}" | base64)"
API="${SERVER_URL}/api/manage"

echo "============================================="
echo " RMail - Organization Provisioning"
echo "============================================="
echo "  Organization : $ORG_NAME"
echo "  Tenant       : $TENANT_NAME"
echo "  Domain       : $DOMAIN"
echo "  Admin        : $ADMIN_EMAIL"
echo "  Server       : $SERVER_URL"
echo "  Quota        : $(( QUOTA / 1073741824 )) GB"
echo ""

PROVISION_DATA=$(cat <<EOF
{
  "tenantName": "$TENANT_NAME",
  "domain": "$DOMAIN",
  "adminName": "$ADMIN_NAME",
  "adminPassword": "$ADMIN_PASS",
  "adminEmail": "$ADMIN_EMAIL",
  "description": "$ORG_NAME",
  "brandName": "$BRAND_NAME",
  "quota": $QUOTA
}
EOF
)

response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "$AUTH_HEADER" \
    -H "Content-Type: application/json" \
    -d "$PROVISION_DATA" \
    "${API}/organization/provision")

http_code=$(echo "$response" | tail -1)
body=$(echo "$response" | sed '$d')

if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    echo "Provisioning successful:"
    echo "$body" | python3 -m json.tool 2>/dev/null || echo "$body"
else
    echo "Provisioning failed (HTTP $http_code):"
    echo "$body"
    exit 1
fi

echo ""
echo "Next steps:"
echo "  - Configure DNS (MX, SPF, DKIM, DMARC) for $DOMAIN"
echo "  - Admin login: $ADMIN_EMAIL at $SERVER_URL/login"
echo "  - Create DKIM: POST ${API}/dkim"
