#!/usr/bin/env bash
# Provision a local domain + two mailbox users for browser E2E (no tenant / no enterprise license).
set -euo pipefail

SERVER_URL="${RMAIL_API_URL:-http://localhost:8080}"
SUPERADMIN_USER="${RMAIL_ADMIN_USER:-admin}"
SUPERADMIN_PASS="${ADMIN_SECRET:?Set ADMIN_SECRET}"
DOMAIN="${E2E_DOMAIN:-example.com}"
ALICE="${E2E_ALICE:-alice@${DOMAIN}}"
BOB="${E2E_BOB:-bob@${DOMAIN}}"
ALICE_PASS="${E2E_ALICE_PASS:-AlicePass123!}"
BOB_PASS="${E2E_BOB_PASS:-BobPass123!}"

AUTH="Authorization: Basic $(echo -n "${SUPERADMIN_USER}:${SUPERADMIN_PASS}" | base64)"
API="${SERVER_URL}/api"

post_principal() {
  local payload="$1"
  local response http_code body
  response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "$payload" "${API}/principal")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')
  if [[ "$http_code" -ge 200 && "$http_code" -lt 300 ]]; then
    echo "$body"
    return 0
  fi
  if echo "$body" | grep -qi "already exists"; then
    echo "$body"
    return 0
  fi
  echo "Failed (HTTP $http_code): $body" >&2
  return 1
}

ensure_email() {
  local email="$1"
  local encoded
  encoded=$(python -c "import urllib.parse; print(urllib.parse.quote('$email'))" 2>/dev/null || echo "$email")
  curl -s -X PATCH \
    -H "$AUTH" -H "Content-Type: application/json" \
    -d "[{\"action\":\"addItem\",\"field\":\"emails\",\"value\":\"${email}\"}]" \
    "${API}/principal/${encoded}" >/dev/null || true
}

echo "==> E2E mail setup on $SERVER_URL"
echo "    Domain: $DOMAIN"
echo "    Alice : $ALICE"
echo "    Bob   : $BOB"

post_principal "$(cat <<EOF
{"type":"domain","name":"${DOMAIN}"}
EOF
)"

post_principal "$(cat <<EOF
{
  "type": "individual",
  "name": "${ALICE}",
  "description": "E2E Alice",
  "roles": ["user"],
  "secrets": ["${ALICE_PASS}"],
  "emails": ["${ALICE}"]
}
EOF
)"

ensure_email "${ALICE}"

post_principal "$(cat <<EOF
{
  "type": "individual",
  "name": "${BOB}",
  "description": "E2E Bob",
  "roles": ["user"],
  "secrets": ["${BOB_PASS}"],
  "emails": ["${BOB}"]
}
EOF
)"

ensure_email "${BOB}"

echo ""
echo "E2E users ready."
echo "  Alice: ${ALICE} / ${ALICE_PASS}"
echo "  Bob:   ${BOB} / ${BOB_PASS}"
