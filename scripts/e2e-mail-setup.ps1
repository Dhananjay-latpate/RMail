# Provision a local domain + two mailbox users for browser E2E.
#
# Stalwart 0.16 dropped the old REST endpoints (/api/principal, /api/domain).
# Domains, accounts and settings are now typed registry objects managed over
# JMAP: POST /jmap with method calls named "x:<ObjectType>/<verb>". We
# authenticate as the pinned recovery admin (see run-e2e-server.ps1) using HTTP
# Basic auth.
param(
    [string]$ServerUrl = $(if ($env:RMAIL_API_URL) { $env:RMAIL_API_URL } else { "http://localhost:8080" }),
    [string]$SuperadminUser = $(if ($env:RMAIL_ADMIN_USER) { $env:RMAIL_ADMIN_USER } else { "admin" }),
    [string]$SuperadminPass = $(if ($env:ADMIN_SECRET) { $env:ADMIN_SECRET } else { "AdminPass123!" }),
    [string]$Domain = $(if ($env:E2E_DOMAIN) { $env:E2E_DOMAIN } else { "example.com" }),
    [string]$Alice = $(if ($env:E2E_ALICE) { $env:E2E_ALICE } else { "alice@$Domain" }),
    [string]$Bob = $(if ($env:E2E_BOB) { $env:E2E_BOB } else { "bob@$Domain" }),
    [string]$AlicePass = $(if ($env:E2E_ALICE_PASS) { $env:E2E_ALICE_PASS } else { "AlicePass123!" }),
    [string]$BobPass = $(if ($env:E2E_BOB_PASS) { $env:E2E_BOB_PASS } else { "BobPass123!" })
)

$ErrorActionPreference = "Stop"

$pair = "${SuperadminUser}:${SuperadminPass}"
$bytes = [System.Text.Encoding]::ASCII.GetBytes($pair)
$auth = "Basic " + [Convert]::ToBase64String($bytes)
$jmapUrl = "$ServerUrl/jmap"

$using = @(
    "urn:ietf:params:jmap:core",
    "urn:ietf:params:jmap:mail",
    "urn:ietf:params:jmap:submission",
    "urn:stalwart:jmap"
)

function Invoke-Jmap {
    param([Parameter(Mandatory)] [array]$Calls)
    $payload = [ordered]@{ using = $using; methodCalls = $Calls }
    $body = $payload | ConvertTo-Json -Depth 25
    return Invoke-RestMethod -Uri $jmapUrl -Method POST -Headers @{ Authorization = $auth; "Content-Type" = "application/json" } -Body $body
}

function Get-Result {
    param($Response, [int]$Index = 0)
    return $Response.methodResponses[$Index][1]
}

# --- Wait for the server to accept authenticated requests -------------------
Write-Host "==> Waiting for RMail JMAP at $ServerUrl …"
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    try {
        $session = Invoke-RestMethod -Uri "$ServerUrl/jmap/session" -Method GET -Headers @{ Authorization = $auth } -TimeoutSec 3
        if ($session) { $ready = $true; break }
    } catch {
        Start-Sleep -Milliseconds 1000
    }
}
if (-not $ready) { Write-Error "Server did not become ready at $ServerUrl"; exit 1 }
Write-Host "    server is up."

Write-Host "==> E2E mail setup on $ServerUrl"
Write-Host "    Domain: $Domain"
Write-Host "    Alice : $Alice"
Write-Host "    Bob   : $Bob"

# --- Enable permissive CORS (webmail dev server runs on a different origin) --
# Create the Http settings singleton with usePermissiveCors, then reload.
try {
    Invoke-Jmap -Calls @(
        ,@("x:Http/set", @{ create = @{ c = @{ usePermissiveCors = $true } } }, "0")
    ) | Out-Null
    Invoke-Jmap -Calls @(
        ,@("x:Action/set", @{ create = @{ c = @{ '@type' = 'ReloadSettings' } } }, "0")
    ) | Out-Null
    Write-Host "    permissive CORS enabled."
} catch {
    Write-Warning "Could not enable permissive CORS: $_"
}

# --- Find or create the domain ---------------------------------------------
$domainId = $null
$q = Invoke-Jmap -Calls @(
    ,@("x:Domain/query", @{ filter = @{ name = $Domain } }, "0")
)
$ids = (Get-Result $q).ids
if ($ids -and $ids.Count -gt 0) {
    $domainId = $ids[0]
    Write-Host "    domain '$Domain' already exists ($domainId)"
} else {
    $resp = Invoke-Jmap -Calls @(
        ,@("x:Domain/set", @{ create = @{ d = @{
            name                  = $Domain
            isEnabled             = $true
            certificateManagement = @{ '@type' = 'Manual' }
            dkimManagement        = @{ '@type' = 'Manual' }
            dnsManagement         = @{ '@type' = 'Manual' }
        } } }, "0")
    )
    $result = Get-Result $resp
    if ($result.created -and $result.created.d) {
        $domainId = $result.created.d.id
        Write-Host "    created domain '$Domain' ($domainId)"
    } else {
        Write-Error "Failed to create domain: $($result | ConvertTo-Json -Depth 10)"
        exit 1
    }
}

# --- Create a mailbox user --------------------------------------------------
function Ensure-User {
    param([string]$Email, [string]$Password, [string]$Description)
    $localPart = $Email.Split('@')[0]

    # Skip if it already exists.
    $q = Invoke-Jmap -Calls @(
        ,@("x:Account/query", @{ filter = @{ name = $localPart } }, "0")
    )
    $existing = (Get-Result $q).ids
    if ($existing -and $existing.Count -gt 0) {
        Write-Host "    user '$Email' already exists"
        return
    }

    $resp = Invoke-Jmap -Calls @(
        ,@("x:Account/set", @{ create = @{ u = @{
            '@type'     = 'User'
            name        = $localPart
            domainId    = $domainId
            description = $Description
            # Registry List<T> is wire-encoded as an object keyed by index, not a JSON array.
            credentials = @{ '0' = @{ '@type' = 'Password'; secret = $Password } }
        } } }, "0")
    )
    $result = Get-Result $resp
    if ($result.created -and $result.created.u) {
        Write-Host "    created user '$Email' ($($result.created.u.id))"
    } else {
        Write-Error "Failed to create user ${Email}: $($result | ConvertTo-Json -Depth 10)"
        exit 1
    }
}

Ensure-User -Email $Alice -Password $AlicePass -Description "E2E Alice"
Ensure-User -Email $Bob   -Password $BobPass   -Description "E2E Bob"

Write-Host ""
Write-Host "E2E users ready."
Write-Host "  Alice: $Alice / $AlicePass"
Write-Host "  Bob:   $Bob / $BobPass"
