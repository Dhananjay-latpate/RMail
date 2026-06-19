# Provision a local domain + two mailbox users for browser E2E.
param(
    [string]$ServerUrl = $(if ($env:RMAIL_API_URL) { $env:RMAIL_API_URL } else { "http://localhost:8080" }),
    [string]$SuperadminUser = $(if ($env:RMAIL_ADMIN_USER) { $env:RMAIL_ADMIN_USER } else { "admin" }),
    [string]$SuperadminPass = $env:ADMIN_SECRET,
    [string]$Domain = $(if ($env:E2E_DOMAIN) { $env:E2E_DOMAIN } else { "example.com" }),
    [string]$Alice = $(if ($env:E2E_ALICE) { $env:E2E_ALICE } else { "alice@$Domain" }),
    [string]$Bob = $(if ($env:E2E_BOB) { $env:E2E_BOB } else { "bob@$Domain" }),
    [string]$AlicePass = $(if ($env:E2E_ALICE_PASS) { $env:E2E_ALICE_PASS } else { "AlicePass123!" }),
    [string]$BobPass = $(if ($env:E2E_BOB_PASS) { $env:E2E_BOB_PASS } else { "BobPass123!" })
)

$ErrorActionPreference = "Stop"

if (-not $SuperadminPass) {
    Write-Error "Set ADMIN_SECRET environment variable"
    exit 1
}

$pair = "${SuperadminUser}:${SuperadminPass}"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
$auth = "Basic " + [Convert]::ToBase64String($bytes)
$api = "$ServerUrl/api"

function Post-Principal {
    param([string]$Payload)
    try {
        $response = Invoke-WebRequest -Uri "$api/principal" `
            -Method POST `
            -Headers @{ Authorization = $auth; "Content-Type" = "application/json" } `
            -Body $Payload `
            -UseBasicParsing
        return $response.Content
    } catch {
        $status = $_.Exception.Response.StatusCode.value__
        $body = ""
        if ($_.ErrorDetails.Message) { $body = $_.ErrorDetails.Message }
        if ($status -ge 200 -and $status -lt 300) { return $body }
        if ($body -match "already exists") { return $body }
        Write-Error "Failed (HTTP $status): $body"
    }
}

function Ensure-PrincipalEmail {
    param([string]$Email)
    $encoded = [uri]::EscapeDataString($Email)
    $patch = @(@{ action = "addItem"; field = "emails"; value = $Email }) | ConvertTo-Json -Compress
    try {
        Invoke-WebRequest -Uri "$api/principal/$encoded" -Method PATCH `
            -Headers @{ Authorization = $auth; "Content-Type" = "application/json" } `
            -Body $patch -UseBasicParsing | Out-Null
    } catch {
        # Ignore if email already registered
    }
}

Write-Host "==> E2E mail setup on $ServerUrl"
Write-Host "    Domain: $Domain"
Write-Host "    Alice : $Alice"
Write-Host "    Bob   : $Bob"

Post-Principal (@{ type = "domain"; name = $Domain } | ConvertTo-Json -Compress) | Out-Null

Post-Principal (@{
    type = "individual"
    name = $Alice
    description = "E2E Alice"
    roles = @("user")
    secrets = @($AlicePass)
    emails = @($Alice)
} | ConvertTo-Json -Compress) | Out-Null
Ensure-PrincipalEmail $Alice

Post-Principal (@{
    type = "individual"
    name = $Bob
    description = "E2E Bob"
    roles = @("user")
    secrets = @($BobPass)
    emails = @($Bob)
} | ConvertTo-Json -Compress) | Out-Null
Ensure-PrincipalEmail $Bob

Write-Host ""
Write-Host "E2E users ready."
Write-Host "  Alice: $Alice / $AlicePass"
Write-Host "  Bob:   $Bob / $BobPass"
