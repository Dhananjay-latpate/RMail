# Start a local RMail (Stalwart 0.16.x) instance for browser E2E (SQLite, no Docker).
#
# The 0.16 server replaced the old `--init` + config.toml model with:
#   * a single JSON "data store" file passed via `--config`
#   * a registry of typed objects (domains, accounts, listeners, ...) that the
#     server provisions on first boot via `insert_safe_defaults`.
#
# This script writes a SQLite data-store config and boots the server. On the
# first boot against an empty database the server creates default roles, an
# internal-directory authentication object and the default network listeners
# (plain HTTP/JMAP on 8080, SMTP on 25, ...). A fixed "recovery" admin is pinned
# via STALWART_RECOVERY_ADMIN so the provisioning script (e2e-mail-setup.ps1)
# can authenticate without parsing a randomly generated secret.
#
# Provisioning of the example.com domain + alice/bob mailboxes is done
# separately by scripts/e2e-mail-setup.ps1 once this server is up.
param(
    [string]$AdminUser = $(if ($env:RMAIL_ADMIN_USER) { $env:RMAIL_ADMIN_USER } else { "admin" }),
    [string]$AdminPass = $(if ($env:ADMIN_SECRET) { $env:ADMIN_SECRET } else { "AdminPass123!" }),
    [string]$MailHostname = $(if ($env:MAIL_HOSTNAME) { $env:MAIL_HOSTNAME } else { "localhost" }),
    [int]$HttpPort = $(if ($env:RMAIL_HTTP_PORT) { [int]$env:RMAIL_HTTP_PORT } else { 8080 })
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$TargetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $Root "target" }
$E2eDir = if ($env:E2E_DATA_DIR) { $env:E2E_DATA_DIR } else { Join-Path $Root ".e2e-data" }
$StalwartBin = if ($env:STALWART_BIN) { $env:STALWART_BIN } else { Join-Path $TargetDir "debug\stalwart.exe" }

if (-not (Test-Path $StalwartBin)) {
    Write-Host "Building stalwart (debug)…"
    Push-Location $Root
    try {
        Remove-Item Env:RUSTUP_TOOLCHAIN -ErrorAction SilentlyContinue
        $vcvars = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path $vcvars) {
            cmd /c "`"$vcvars`" && cargo build -p stalwart --no-default-features --features `"sqlite enterprise`""
        } else {
            cargo build -p stalwart --no-default-features --features "sqlite enterprise"
        }
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path $StalwartBin)) {
        Write-Error "Build finished but binary not found at $StalwartBin. Set STALWART_BIN if using a custom CARGO_TARGET_DIR."
        exit 1
    }
}

# Data directory + SQLite data-store config file.
$DataDir = Join-Path $E2eDir "data"
if (-not (Test-Path $DataDir)) { New-Item -ItemType Directory -Force -Path $DataDir | Out-Null }

$DbPath = (Join-Path $DataDir "stalwart.db") -replace '\\', '/'
$ConfigPath = Join-Path $E2eDir "config.json"
$config = @{
    '@type'              = 'Sqlite'
    path                 = $DbPath
    poolMaxConnections   = 10
} | ConvertTo-Json -Compress
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($ConfigPath, $config, $utf8NoBom)

# Pin a deterministic fallback admin so provisioning can authenticate, force the
# hostname to localhost and advertise the plain-HTTP JMAP endpoint in the JMAP
# session object (otherwise the server would advertise an https:// URL the dev
# webmail cannot reach).
$env:STALWART_RECOVERY_ADMIN = "${AdminUser}:${AdminPass}"
$env:STALWART_HOSTNAME = $MailHostname
$env:STALWART_PUBLIC_URL = "http://localhost:$HttpPort"

Write-Host "Starting RMail on http://localhost:$HttpPort (data: $E2eDir)"
Write-Host "  admin login: $AdminUser / $AdminPass"
& $StalwartBin --config $ConfigPath
