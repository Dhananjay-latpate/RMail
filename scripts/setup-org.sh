#!/usr/bin/env bash
# =============================================================================
# setup-org.sh - Onboard a new client organization to RMail
# =============================================================================
#
# This script creates a new tenant (organization), its domain, and an
# administrator account using the Stalwart REST API.
#
# Prerequisites:
#   - The RMail server must be running (docker compose up -d)
#   - curl must be installed
#
# Usage:
#   ./scripts/setup-org.sh \
#     --domain "clientA.com" \
#     --org    "Client A Inc." \
#     --admin  "admin@clientA.com" \
#     --password "SecurePass123!"
#
# Options:
#   --domain      Primary email domain for the organization (required)
#   --org         Organization display name (required)
#   --admin       Admin email address for this organization (required)
#   --password    Password for the admin account (required)
#   --server      Mail server URL (default: http://localhost:8080)
#   --superadmin  Super-admin username (default: admin)
#   --secret      Super-admin password (default: value of ADMIN_SECRET env var)
#   --quota       Disk quota in bytes for the organization (default: 10737418240 = 10GB)
#   --help        Show this help message
# =============================================================================

set -euo pipefail

# ---- Defaults ----
SERVER_URL="http://localhost:8080"
SUPERADMIN_USER="admin"
SUPERADMIN_PASS="${ADMIN_SECRET:-changeme}"
QUOTA=10737418240  # 10 GB

# ---- Parse Arguments ----
DOMAIN=""
ORG_NAME=""
ADMIN_EMAIL=""
ADMIN_PASS=""

usage() {
    echo "Usage: $0 --domain <domain> --org <name> --admin <email> --password <pass>"
    echo ""
    echo "Options:"
    echo "  --domain      Primary email domain for the organization (required)"
    echo "  --org         Organization display name (required)"
    echo "  --admin       Admin email address for this organization (required)"
    echo "  --password    Password for the admin account (required)"
    echo "  --server      Mail server URL (default: http://localhost:8080)"
    echo "  --superadmin  Super-admin username (default: admin)"
    echo "  --secret      Super-admin password (default: ADMIN_SECRET env var)"
    echo "  --quota       Disk quota in bytes (default: 10737418240 = 10GB)"
    echo "  --help        Show this help message"
    exit 1
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --domain)    DOMAIN="$2";          shift 2 ;;
        --org)       ORG_NAME="$2";        shift 2 ;;
        --admin)     ADMIN_EMAIL="$2";     shift 2 ;;
        --password)  ADMIN_PASS="$2";      shift 2 ;;
        --server)    SERVER_URL="$2";      shift 2 ;;
        --superadmin) SUPERADMIN_USER="$2"; shift 2 ;;
        --secret)    SUPERADMIN_PASS="$2"; shift 2 ;;
        --quota)     QUOTA="$2";           shift 2 ;;
        --help)      usage ;;
        *)           echo "Unknown option: $1"; usage ;;
    esac
done

# ---- Validate Required Arguments ----
if [[ -z "$DOMAIN" || -z "$ORG_NAME" || -z "$ADMIN_EMAIL" || -z "$ADMIN_PASS" ]]; then
    echo "Error: --domain, --org, --admin, and --password are all required."
    usage
fi

AUTH_HEADER="Authorization: Basic $(echo -n "${SUPERADMIN_USER}:${SUPERADMIN_PASS}" | base64)"
API="${SERVER_URL}/api"

# Helper: make an API call and check for success
api_call() {
    local method="$1" endpoint="$2" data="${3:-}"
    local response http_code

    if [[ -n "$data" ]]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "$AUTH_HEADER" \
            -H "Content-Type: application/json" \
            -d "$data" \
            "${API}${endpoint}" 2>&1) || true
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" \
            -H "$AUTH_HEADER" \
            "${API}${endpoint}" 2>&1) || true
    fi

    http_code=$(echo "$response" | tail -1)
    body=$(echo "$response" | sed '$d')

    if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
        echo "$body"
        return 0
    else
        echo "API Error (HTTP $http_code): $body" >&2
        return 1
    fi
}

echo "============================================="
echo " RMail - New Organization Setup"
echo "============================================="
echo ""
echo "  Organization : $ORG_NAME"
echo "  Domain       : $DOMAIN"
echo "  Admin        : $ADMIN_EMAIL"
echo "  Server       : $SERVER_URL"
echo "  Quota        : $(( QUOTA / 1073741824 )) GB"
echo ""

# ---- Step 1: Create the Tenant (Organization) ----
echo "Step 1/3: Creating tenant '$ORG_NAME'..."
TENANT_DATA=$(cat <<EOF
{
    "type": "tenant",
    "name": "$(echo "$ORG_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')",
    "description": "$ORG_NAME",
    "quota": $QUOTA
}
EOF
)
if api_call POST "/principal" "$TENANT_DATA" > /dev/null 2>&1; then
    echo "  ✅ Tenant created."
else
    echo "  ⚠️  Tenant may already exist or an error occurred (continuing)."
fi

TENANT_NAME="$(echo "$ORG_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')"

# ---- Step 2: Create the Domain ----
echo "Step 2/3: Creating domain '$DOMAIN'..."
DOMAIN_DATA=$(cat <<EOF
{
    "type": "domain",
    "name": "$DOMAIN",
    "tenant": "$TENANT_NAME"
}
EOF
)
if api_call POST "/principal" "$DOMAIN_DATA" > /dev/null 2>&1; then
    echo "  ✅ Domain created."
else
    echo "  ⚠️  Domain may already exist or an error occurred (continuing)."
fi

# ---- Step 3: Create the Organization Admin Account ----
echo "Step 3/3: Creating admin account '$ADMIN_EMAIL'..."
ADMIN_NAME="$(echo "$ADMIN_EMAIL" | cut -d'@' -f1)"
ADMIN_DATA=$(cat <<EOF
{
    "type": "individual",
    "name": "$ADMIN_NAME",
    "secrets": ["$ADMIN_PASS"],
    "emails": ["$ADMIN_EMAIL"],
    "tenant": "$TENANT_NAME",
    "roles": ["tenant-admin"]
}
EOF
)
if api_call POST "/principal" "$ADMIN_DATA" > /dev/null 2>&1; then
    echo "  ✅ Admin account created."
else
    echo "  ⚠️  Admin account may already exist or an error occurred (continuing)."
fi

echo ""
echo "============================================="
echo " Setup Complete!"
echo "============================================="
echo ""
echo "  The organization '$ORG_NAME' is ready."
echo ""
echo "  Admin login:  $ADMIN_EMAIL"
echo "  Web admin:    $SERVER_URL/login"
echo ""
echo "  Next steps:"
echo "    - Configure DNS records (MX, SPF, DKIM, DMARC) for $DOMAIN"
echo "    - Add user accounts via the web admin or API"
echo "    - Configure TLS certificates for $DOMAIN"
echo ""
