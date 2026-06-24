# RMail Agent Guide — E2E Testing (Windows Native)

This document describes how to run browser end-to-end tests on **Windows native** (no WSL, no Docker required for mail).

## Prerequisites

| Tool | Purpose |
|------|---------|
| **Rust 1.96+** (`rust-toolchain.toml`) | Build `stalwart` mail server |
| **MSVC Build Tools** *or* **MinGW (WinLibs)** | Native linker for `cargo build` |
| **Node.js 20+** | Product webmail + Playwright |
| **PowerShell 5.1+** | E2E helper scripts |

### Install MSVC Build Tools (required)

Stalwart uses Unix signal APIs that are not available on the GNU toolchain. **MSVC is required** on Windows:

```powershell
winget install -e --id Microsoft.VisualStudio.2022.BuildTools --override "--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

After install, open a **new terminal** so `link.exe` is on PATH, then build:

```powershell
cargo build -p stalwart --no-default-features --features "sqlite enterprise"
```

## E2E Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Playwright     │────▶│  Webmail (Vite)  │────▶│  RMail (stalwart)│
│  product/e2e/   │     │  localhost:3001  │     │  localhost:8080  │
└─────────────────┘     └──────────────────┘     └──────────────────┘
```

Mail E2E uses **SQLite** (no PostgreSQL/Docker). Two test users are provisioned via the management API.

## Quick Start

### 1. Start the mail server

```powershell
$env:ADMIN_SECRET = "e2e-admin-secret"
.\scripts\run-e2e-server.ps1
```

First run builds `target\debug\stalwart.exe` and initializes `.e2e-data\`.

### 2. Provision test users (new terminal)

```powershell
$env:ADMIN_SECRET = "e2e-admin-secret"
.\scripts\e2e-mail-setup.ps1
```

Creates:

| User | Email | Password |
|------|-------|----------|
| Alice | `alice@example.com` | `AlicePass123!` |
| Bob | `bob@example.com` | `BobPass123!` |

### 3. Start webmail dev server (new terminal)

```powershell
cd product
npm install
$env:VITE_RMAIL_API_URL = "http://localhost:8080"
npm run dev --workspace=webmail
```

### 4. Run Playwright E2E tests

```powershell
cd product
npm run e2e
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_SECRET` | `e2e-admin-secret` | Superadmin password |
| `E2E_DATA_DIR` | `.e2e-data` | Mail server data directory |
| `RMAIL_API_URL` | `http://localhost:8080` | Mail API base URL |
| `E2E_DOMAIN` | `example.com` | Test mail domain |
| `E2E_ALICE` / `E2E_BOB` | `alice@example.com` / `bob@example.com` | Test accounts |
| `VITE_RMAIL_API_URL` | `http://localhost:8080` | Webmail → mail API |
| `E2E_WEBMAIL_URL` | `http://localhost:3001` | Playwright target URL |

## Test Scenarios

### Webmail (`product/e2e/webmail.spec.ts`)

1. **Login** — Alice signs in, sees inbox
2. **Compose & send** — Alice sends mail to Bob
3. **Receive** — Bob logs in and sees the message

### Portal smoke (manual, requires Docker PostgreSQL)

Portal + product API tests need PostgreSQL. Use `.\scripts\run-product-tests.sh` in Git Bash/WSL or Docker:

```bash
./scripts/run-product-tests.sh   # 16 API integration tests
```

Manual browser flow: signup → plan → onboarding → provision mail.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `link.exe not found` | Install MSVC Build Tools (see above), then open a new terminal |
| GNU toolchain build fails | Do not use `windows-gnu` — stalwart requires MSVC on Windows |
| Port 8080 in use | Stop other services or change HTTP port in `.e2e-data\etc\config.toml` |
| Login fails | Re-run `e2e-mail-setup.ps1`; check `ADMIN_SECRET` matches |
| CORS errors | E2E config sets `permissive-cors = true` automatically |

## Bash equivalents (Git Bash / WSL)

The original bash scripts still work in Git Bash:

```bash
ADMIN_SECRET=e2e-admin-secret ./scripts/run-e2e-server.sh
ADMIN_SECRET=e2e-admin-secret ./scripts/e2e-mail-setup.sh
```

On Windows Git Bash, `run-e2e-server.sh` uses `file:///NUL` instead of `/dev/null` for spam-filter config.

## CI / Full Verification

```bash
./scripts/verify-all.sh          # Rust compile + product builds + integration tests
```

Requires Docker for product integration tests.
