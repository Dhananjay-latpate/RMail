# RMail Production Deployment Guide

## Mail VPS Requirements

- Static public IPv4 with reverse DNS (PTR) matching `MAIL_HOSTNAME`
- Open ports: 25, 587, 465, 143, 993, 443, 8080
- 4+ vCPU, 8+ GB RAM recommended
- Valid Stalwart Enterprise license (`ENTERPRISE_LICENSE_KEY`)

## Quick Start

```bash
cp .env.example .env
# Edit .env: POSTGRES_PASSWORD, ADMIN_SECRET, MAIL_HOSTNAME, ENTERPRISE_LICENSE_KEY

docker compose up -d --build
./scripts/provision-pilot-orgs.sh
```

## DNS Records (per customer domain)

| Type | Name | Value |
|------|------|-------|
| MX | @ | `10 mail.yourproduct.com` |
| TXT | @ | `v=spf1 mx a:mail.yourproduct.com -all` |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourproduct.com` |
| TXT | `{selector}._domainkey` | From `POST /api/manage/dkim` |
| CNAME | `autodiscover` | `mail.yourproduct.com` |
| CNAME | `autoconfig` | `mail.yourproduct.com` |

## Product Stack

Start the SaaS control plane alongside mail:

```bash
cd product
cp .env.example .env
docker compose up -d
```

- Portal: http://localhost:3000
- API: http://localhost:4000
- Webmail: http://localhost:3001

## Verification (run before production)

Run the full automated verification suite:

```bash
chmod +x scripts/verify-all.sh scripts/run-product-tests.sh
./scripts/verify-all.sh
```

This checks:
- RMail compiles with enterprise features (Rust 1.96+ via `rust-toolchain.toml`)
- Product API, portal, and webmail build
- **16 integration tests** (auth, checkout, org CRUD, DNS, audit, usage, SSO, access control)
- Shell script syntax

Product-only tests:

```bash
./scripts/run-product-tests.sh
```

Manual browser smoke test (with API + portal running):
1. Open http://localhost:3000/signup
2. Complete account → organization → plan → subscribe
3. Confirm redirect to `/onboarding/:orgId` with DNS records
4. Click **Provision mail server** (requires RMail running on port 8080)

## Architecture

- **RMail** (`docker-compose.yml`) — mail protocols, tenant isolation, JMAP
- **Product API** (`product/api`) — Stripe billing, provisioning orchestration
- **Portal** (`product/portal`) — signup, onboarding, org admin
- **Webmail** (`product/webmail`) — JMAP browser client
