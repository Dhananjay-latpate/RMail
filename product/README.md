# RMail Product Control Plane

Google Workspace-style SaaS layer for RMail: signup, billing, org onboarding, and admin console.

## Components

| Service | Port | Description |
|---------|------|-------------|
| `api/` | 4000 | Billing, provisioning, user management |
| `portal/` | 3000 | Signup, onboarding, org admin UI |
| `webmail/` | 3001 | JMAP browser client with tenant branding |

## Quick Start (Development)

```bash
# 1. Start mail platform (from repo root)
cp .env.example .env
# Set POSTGRES_PASSWORD, ADMIN_SECRET, ENTERPRISE_LICENSE_KEY, MAIL_HOSTNAME
docker compose up -d --build

# 2. Start product stack
cd product
cp .env.example .env
# Set JWT_SECRET, RMAIL_ADMIN_SECRET (same as ADMIN_SECRET)

docker compose up -d --build
# Or run locally:
npm install
npm run db:migrate
npm run dev --workspace=api &
npm run dev --workspace=portal &
npm run dev --workspace=webmail
```

## Signup Flow

1. User registers at `/signup`
2. Chooses plan and seats → Stripe Checkout (or dev provision without Stripe)
3. On payment → API provisions org via `POST /api/manage/organization/provision`
4. DNS onboarding wizard at `/onboarding/:orgId`
5. Org admin manages users at `/dashboard/:orgId`

## Stripe Setup

1. Create products in Stripe Dashboard (Starter, Business, Enterprise)
2. Set price IDs in `.env`: `STRIPE_PRICE_STARTER`, etc.
3. Configure webhook endpoint: `POST /api/webhooks/stripe`
4. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`

## API Endpoints

- `POST /api/auth/register` — Create product account
- `POST /api/checkout/create-session` — Start subscription
- `POST /api/orgs/:id/provision` — Dev/manual RMail provisioning
- `GET /api/orgs/:id/dns` — DNS records for domain setup
- `POST /api/orgs/:id/dns/verify` — Check TXT/MX records
- `GET/POST /api/orgs/:id/users` — Team member CRUD
- `GET /api/orgs/:id/usage` — Seat/storage metering
- `GET /api/orgs/:id/audit` — Admin audit log
- `PUT /api/orgs/:id/sso` — OIDC SSO configuration
- `GET/POST /api/orgs/:id/groups` — Mailing groups
