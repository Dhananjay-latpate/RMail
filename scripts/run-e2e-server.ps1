# Start a local RMail instance for browser E2E (SQLite, no Docker).
param(
    [string]$AdminSecret = $(if ($env:ADMIN_SECRET) { $env:ADMIN_SECRET } else { "e2e-admin-secret" }),
    [string]$MailHostname = $(if ($env:MAIL_HOSTNAME) { $env:MAIL_HOSTNAME } else { "localhost" })
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

$configPath = Join-Path $E2eDir "etc\config.toml"
if (-not (Test-Path $configPath)) {
    Write-Host "Initializing RMail at $E2eDir"
    if (Test-Path $E2eDir) { Remove-Item -Recurse -Force $E2eDir }

    & $StalwartBin --init $E2eDir
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    $content = Get-Content $configPath -Raw
    $e2ePath = ($E2eDir -replace '\\', '/')
    $content = Get-Content $configPath -Raw
    $content = $content -replace '\\', '/'
    $content = $content `
        -replace 'data = "rocksdb"', 'data = "sqlite"' `
        -replace 'fts = "rocksdb"', 'fts = "sqlite"' `
        -replace 'blob = "rocksdb"', 'blob = "sqlite"' `
        -replace 'lookup = "rocksdb"', 'lookup = "sqlite"' `
        -replace '\[store\.rocksdb\]', '[store.sqlite]' `
        -replace 'type = "rocksdb"', 'type = "sqlite"' `
        -replace "path = `"$e2ePath/data`"", "path = `"$e2ePath/data/stalwart.db`"" `
        -replace 'store = "rocksdb"', 'store = "sqlite"'

    $append = @"

[http]
permissive-cors = true

[server]
hostname = "$MailHostname"

[lookup]
default.hostname = "$MailHostname"

[spam-filter]
enable = false

config.resource.spam-filter = "file:///NUL"

"@

    $content = $content + $append
    if ($content -match '(?m)^secret =') {
        $content = $content -replace '(?m)^secret =.*', "secret = `"$AdminSecret`""
    }
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($configPath, $content, $utf8NoBom)
}

$env:ADMIN_SECRET = $AdminSecret
Write-Host "Starting RMail on http://localhost:8080 (data: $E2eDir)"
& $StalwartBin --config $configPath
