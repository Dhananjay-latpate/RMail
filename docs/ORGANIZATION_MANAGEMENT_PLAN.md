# RMail Organization Management & Client Application Plan

## Overview

This document provides a comprehensive plan for transforming the RMail (Stalwart-based) mail
server framework into a multi-tenant SaaS platform operated by Relics IT Services. The plan
covers organization deployment, admin facilities, email configuration management, and
white-labeled client applications.

---

## Part 1: Organization Deployment & Admin Facilities

### 1.1 Current Capabilities (Already Implemented)

The framework already provides these core multi-tenancy features:

| Feature | Status | Location |
|---------|--------|----------|
| **Tenant principal type** | ✅ Exists | `crates/directory/src/lib.rs` (`Type::Tenant`) |
| **Tenant admin role** | ✅ Exists | `ROLE_TENANT_ADMIN` with scoped permissions |
| **Domain management** | ✅ Exists | `Type::Domain` + CRUD API |
| **User management** | ✅ Exists | `Type::Individual` + CRUD API |
| **Permission system** | ✅ Exists | 70+ granular permissions with RBAC |
| **Tenant isolation** | ✅ Exists | Enterprise feature with data isolation |
| **DKIM management** | ✅ Exists | `/manage/dkim` API |
| **SMTP queue management** | ✅ Exists | `/manage/queue` API |
| **Settings management** | ✅ Exists | `/manage/settings` API |

### 1.2 New Features (Implemented in This PR)

#### 1.2.1 RMail Branding

**Files Changed:**
- `crates/common/src/lib.rs` — Updated `USER_AGENT`, `DAEMON_NAME`, `PROD_ID` constants

The server now identifies as **RMail** instead of Stalwart:
```
User-Agent: RMail/1.0.0
Server: RMail v0.15.5
Producer: -//Relics IT Services//RMail Server//EN
```

#### 1.2.2 Organization Branding Fields

**Files Changed:**
- `crates/directory/src/lib.rs` — Added `BrandName`, `BrandLogoUrl`, `BrandTheme` to `PrincipalData`
- `crates/directory/src/backend/internal/mod.rs` — Added fields to `PrincipalField` enum with ID mapping
- `crates/directory/src/backend/internal/manage.rs` — Wired through create, update, and map_principal flows
- `crates/directory/src/core/principal.rs` — Added deserialization and object_size support

New fields on Tenant principals:

| Field | Type | Description |
|-------|------|-------------|
| `brandName` | String | Display name for the organization (e.g., "Acme Corp Mail") |
| `brandLogoUrl` | String | URL to the organization's logo for client apps |
| `brandTheme` | String | JSON configuration for theme customization (colors, fonts) |

**API Usage:**
```json
// Creating a tenant with branding
POST /api/manage/principal
{
  "type": "tenant",
  "name": "acme-corp",
  "description": "Acme Corporation",
  "brandName": "Acme Mail",
  "brandLogoUrl": "https://acme.com/logo.png",
  "brandTheme": "{\"primaryColor\":\"#FF5733\",\"accentColor\":\"#33FF57\"}"
}

// Updating branding on an existing tenant
PUT /api/manage/principal/acme-corp
[
  {"action": "set", "field": "brandName", "value": "Acme Mail Pro"},
  {"action": "set", "field": "brandLogoUrl", "value": "https://acme.com/logo-v2.png"}
]
```

#### 1.2.3 Organization Provisioning Endpoint

**File Added:**
- `crates/http/src/management/organization.rs` — New endpoint for one-call org setup

**Endpoint:** `POST /api/manage/organization/provision`

Creates a complete organization (tenant + domain + admin user) in a single API call:

```json
POST /api/manage/organization/provision
{
  "tenantName": "acme-corp",
  "domain": "acme.com",
  "adminName": "admin",
  "adminPassword": "securePassword123",
  "adminEmail": "admin@acme.com",
  "description": "Acme Corporation Email",
  "brandName": "Acme Mail",
  "brandLogoUrl": "https://acme.com/logo.png",
  "brandTheme": "{\"primaryColor\":\"#FF5733\"}"
}
```

**Response:**
```json
{
  "data": {
    "tenantId": 1001,
    "domainId": 1002,
    "adminId": 1003
  }
}
```

**Permissions Required:** `TenantCreate`, `DomainCreate`, `IndividualCreate`

This endpoint:
1. Creates the tenant with optional branding configuration
2. Creates the domain under the new tenant
3. Creates the admin user with `tenant-admin` role under the new tenant
4. Returns all three IDs for reference

---

### 1.3 Organization Admin Capabilities

Once provisioned, the tenant admin can perform these operations through the existing Management API:

#### User Management
```
POST   /api/manage/principal          — Create user (within their tenant)
GET    /api/manage/principal?type=individual — List users
GET    /api/manage/principal/{name}   — Get user details
PUT    /api/manage/principal/{name}   — Update user
DELETE /api/manage/principal/{name}   — Delete user
```

#### Domain Management
```
POST   /api/manage/principal          — Add domain (type: "domain")
GET    /api/manage/principal?type=domain — List domains
DELETE /api/manage/principal/{domain} — Remove domain
```

#### Email Configuration
```
GET    /api/manage/settings           — View email settings
PUT    /api/manage/settings           — Update email settings
POST   /api/manage/dkim              — Create DKIM signatures
GET    /api/manage/dkim/{domain}     — Get DKIM configuration
```

#### Group & Mailing List Management
```
POST   /api/manage/principal          — Create group/list
GET    /api/manage/principal?type=group — List groups
GET    /api/manage/principal?type=list  — List mailing lists
```

#### Queue & Report Management
```
GET    /api/manage/queue              — View message queue
GET    /api/manage/reports            — View DMARC/TLS reports
```

---

### 1.4 Future Enhancements (Roadmap)

#### Phase 2: Advanced Organization Features
- [ ] Organization usage analytics and billing metrics
- [ ] Per-tenant storage quota enforcement and monitoring
- [ ] Organization-level audit logging
- [ ] Tenant self-service portal (password reset, profile management)
- [ ] Organization migration/export tools

#### Phase 3: Advanced Admin Features
- [ ] Custom admin roles (sub-roles within tenant-admin)
- [ ] Admin delegation with granular permission scoping
- [ ] Per-tenant OAuth/OIDC application registration
- [ ] Per-tenant SAML SSO configuration
- [ ] Organization-level spam filter customization
- [ ] Custom email templates per organization

#### Phase 4: DNS & Domain Automation
- [ ] Automated DNS record validation for added domains
- [ ] DKIM/DMARC/SPF setup wizard per domain
- [ ] Domain verification workflow (TXT record check)
- [ ] Automated SSL/TLS certificate provisioning per domain

---

## Part 2: Client Applications with RMail Branding

### 2.1 Web Client Application

#### Architecture
The web admin dashboard is delivered as a swappable ZIP bundle (`webadmin.resource` config key).
This allows per-deployment and per-tenant customization.

#### Implementation Plan

**Phase 1: RMail-Branded Web Client**
- [ ] Fork the stalwartlabs/webadmin repository
- [ ] Replace all Stalwart branding with RMail branding:
  - Logo, favicon, app name
  - Color scheme to RMail brand colors
  - Footer text and about page
- [ ] Build and host the RMail webadmin ZIP bundle
- [ ] Configure `webadmin.resource` to point to RMail bundle

**Phase 2: Dynamic Branding (Per-Tenant)**
- [ ] Implement a branding API endpoint that returns tenant-specific branding:
  ```
  GET /api/branding — Returns branding based on authenticated user's tenant
  ```
- [ ] Modify web client to fetch and apply branding dynamically:
  - Load `brandName` for app title
  - Load `brandLogoUrl` for header/login logo
  - Apply `brandTheme` CSS variables for colors/fonts
- [ ] Support white-label domains (custom domain → tenant mapping)

**Phase 3: End-User Webmail**
- [ ] Develop or integrate a JMAP/IMAP webmail interface
- [ ] Apply per-tenant branding to the webmail interface
- [ ] Include calendar, contacts, and file sharing views

### 2.2 Desktop Client Application

#### Technology Options
| Option | Pros | Cons |
|--------|------|------|
| **Electron + Web Client** | Code reuse, fast development | Larger binary size |
| **Tauri + Web Client** | Smaller binary, Rust backend | Newer ecosystem |
| **Native (Qt/GTK)** | Best performance | Higher development cost |

#### Recommended: Tauri + Web Client

**Phase 1: Core Desktop Client**
- [ ] Create Tauri application wrapper around the web client
- [ ] Add desktop-specific features:
  - System tray integration with notification badge
  - Desktop notifications for new emails
  - OS-level file attachment integration
  - Auto-start on login
- [ ] Package for Windows (.msi), macOS (.dmg), Linux (.deb/.rpm)

**Phase 2: Desktop Branding**
- [ ] Dynamic branding at launch based on configuration:
  - App icon customization
  - Window title from `brandName`
  - Splash screen with organization logo
- [ ] Support branded installer generation:
  - Custom app name (e.g., "Acme Mail Desktop")
  - Custom icons and splash screens
  - Pre-configured server URL

### 2.3 Mobile Client Application

#### Technology Options
| Option | Pros | Cons |
|--------|------|------|
| **React Native** | Single codebase, large ecosystem | Performance overhead |
| **Flutter** | Fast UI, single codebase | Dart ecosystem |
| **Native (Swift/Kotlin)** | Best UX, performance | Two codebases |

#### Recommended: React Native or Flutter

**Phase 1: Core Mobile Client**
- [ ] Implement IMAP/JMAP email client:
  - Email inbox, compose, reply, forward
  - Contact and calendar sync (CardDAV/CalDAV)
  - Push notifications
  - Offline message caching
- [ ] Authentication:
  - OAuth 2.0 flow for secure login
  - Biometric authentication support
  - App passwords for legacy account support

**Phase 2: Mobile Branding**
- [ ] Dynamic branding from server configuration:
  - App logo from `brandLogoUrl`
  - Theme colors from `brandTheme`
  - App name from `brandName`
- [ ] White-label app builds:
  - Build pipeline for custom-branded apps
  - Configurable app ID and signing
  - Custom App Store / Play Store listings

### 2.4 Branding Configuration Schema

The `brandTheme` field supports a JSON configuration:

```json
{
  "primaryColor": "#1976D2",
  "accentColor": "#FF4081",
  "backgroundColor": "#FFFFFF",
  "textColor": "#212121",
  "fontFamily": "Roboto, sans-serif",
  "borderRadius": "8px",
  "loginBackground": "https://cdn.example.com/bg.jpg",
  "customCss": "https://cdn.example.com/custom.css"
}
```

Client applications read this configuration from the branding endpoint and apply it
to their UI at runtime.

---

## Part 3: Deployment Architecture

### 3.1 Infrastructure

```
┌──────────────────────────────────────────────────────────────┐
│                    Load Balancer (HTTPS)                       │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │  RMail   │  │  RMail   │  │  RMail   │  │  RMail   │    │
│  │ Node 1   │  │ Node 2   │  │ Node 3   │  │ Node N   │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │              │              │              │          │
│  ┌────┴──────────────┴──────────────┴──────────────┴───┐    │
│  │            Shared Storage Backend                     │    │
│  │     (PostgreSQL / FoundationDB + S3 Blob Store)       │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐    │
│  │     Message Bus (Kafka / NATS / Redis)                │    │
│  │     (Cluster coordination & event broadcasting)       │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 Multi-Tenant Data Isolation

- Each organization is a **Tenant** principal with its own ID
- All users, groups, domains, and resources reference their tenant ID
- Data queries are automatically scoped to the authenticated user's tenant
- Tenant admins cannot access resources outside their tenant boundary
- Global admins (Relics IT) can manage all tenants

### 3.3 Deployment Workflow

1. **Relics admin** provisions a new organization via `/api/manage/organization/provision`
2. The endpoint creates tenant + domain + admin in one atomic operation
3. **Org admin** receives credentials and logs into the admin panel
4. **Org admin** creates user accounts, configures DKIM/DMARC
5. **End users** connect via IMAP/POP3/JMAP or the RMail client apps

---

## Part 4: Security Considerations

### 4.1 Authentication & Authorization
- JWT-based access tokens with permission bitsets
- Role-based access control (RBAC) with tenant scoping
- Two-factor authentication (TOTP) support
- App-specific passwords for legacy email clients
- OAuth 2.0 / OpenID Connect for modern clients

### 4.2 Data Security
- TLS encryption for all protocols (SMTP, IMAP, HTTP)
- S/MIME and OpenPGP message encryption
- Encryption at rest for stored messages
- DKIM, DMARC, SPF, ARC email authentication
- DANE and MTA-STS for transport security

### 4.3 Tenant Isolation
- Strict data boundaries between tenants
- Permission-based access control at all API endpoints
- Rate limiting per user and per tenant
- Audit logging for administrative actions

---

## Summary of Changes in This PR

| Change | File(s) | Description |
|--------|---------|-------------|
| RMail branding | `crates/common/src/lib.rs` | Updated USER_AGENT, DAEMON_NAME, PROD_ID |
| WWW-Authenticate realm | `crates/http/src/management/mod.rs` | Changed from "Stalwart Server" to "RMail Server" |
| Branding data model | `crates/directory/src/lib.rs` | Added BrandName, BrandLogoUrl, BrandTheme to PrincipalData |
| Branding field mapping | `crates/directory/src/backend/internal/mod.rs` | Added fields to PrincipalField with ID/string mapping |
| Branding CRUD | `crates/directory/src/backend/internal/manage.rs` | Create, update, and map_principal support |
| Branding deserialization | `crates/directory/src/core/principal.rs` | JSON deserialization and object_size |
| Principal update validation | `crates/http/src/management/principal.rs` | Allow branding fields in update operations |
| Organization provisioning | `crates/http/src/management/organization.rs` | New endpoint for one-call org setup |
| Route registration | `crates/http/src/management/mod.rs` | Register organization module and route |
| Documentation | `docs/ORGANIZATION_MANAGEMENT_PLAN.md` | This comprehensive plan document |
