# Starts Ascend Services locally: Postgres in Docker, then the Next.js dev server.
# From this folder:
#   powershell -ExecutionPolicy Bypass -File .\start-local.ps1

$ErrorActionPreference = 'Stop'

$PlaceholderSecret = 'replace-me-with-openssl-rand-base64-48-at-least-32-chars'
$Root = $PSScriptRoot

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    Write-Host ""
    Write-Host "==> $Message"
}

function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$Label,
        [Parameter(Mandatory)][scriptblock]$Command
    )
    Write-Step $Label
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Label failed with exit code $LASTEXITCODE."
    }
}

function Assert-Command {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$InstallHint
    )
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is not installed. $InstallHint"
    }
}

function New-SessionSecret {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    return [Convert]::ToBase64String($bytes)
}

function Initialize-EnvFile {
    param([Parameter(Mandatory)][string]$ProjectRoot)

    $examplePath = Join-Path $ProjectRoot '.env.example'
    $envPath = Join-Path $ProjectRoot '.env'

    if (-not (Test-Path -LiteralPath $examplePath)) {
        throw "Missing .env.example in $ProjectRoot."
    }

    if (-not (Test-Path -LiteralPath $envPath)) {
        Copy-Item -LiteralPath $examplePath -Destination $envPath
        Write-Host "Created .env from .env.example."
    }
    else {
        Write-Host ".env already exists; leaving existing values in place."
    }

    $text = [System.IO.File]::ReadAllText($envPath)
    if ([string]::IsNullOrWhiteSpace($text)) {
        throw ".env is empty."
    }

    $pattern = '(?m)^AUTH_SESSION_SECRET="([^"]*)"'
    $match = [regex]::Match($text, $pattern)
    if (-not $match.Success) {
        throw 'AUTH_SESSION_SECRET is missing from .env.'
    }

    $current = $match.Groups[1].Value
    $needsSecret = [string]::IsNullOrWhiteSpace($current) -or $current -eq $PlaceholderSecret -or $current.Length -lt 32
    if (-not $needsSecret) {
        Write-Host "AUTH_SESSION_SECRET is already set."
        return
    }

    $secret = New-SessionSecret
    $updated = [regex]::Replace($text, $pattern, "AUTH_SESSION_SECRET=`"$secret`"", 1)
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($envPath, $updated, $utf8)
    Write-Host "Generated a local AUTH_SESSION_SECRET in .env."
}

$script:UseCorepackPnpm = $false

function Enable-Pnpm {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) {
        return
    }

    Assert-Command -Name 'node' -InstallHint 'Install Node.js from https://nodejs.org, then run this script again.'
    Assert-Command -Name 'corepack' -InstallHint 'Reinstall Node.js (corepack ships with it), then run this script again.'

    Write-Step "Activating pnpm 12.6.0 via corepack"
    & corepack enable
    if ($LASTEXITCODE -eq 0) {
        & corepack prepare pnpm@12.6.0 --activate
        if ($LASTEXITCODE -eq 0 -and (Get-Command pnpm -ErrorAction SilentlyContinue)) {
            return
        }
    }

    # Node is often installed under Program Files, where corepack cannot write
    # a global shim without an elevated prompt. corepack can still run pnpm.
    Write-Host "Using corepack pnpm (a global pnpm command needs an admin install)."
    & corepack pnpm --version
    if ($LASTEXITCODE -ne 0) {
        throw "corepack pnpm failed with exit code $LASTEXITCODE."
    }
    $script:UseCorepackPnpm = $true
}

function Invoke-Pnpm {
    param([Parameter(Mandatory)][string[]]$PnpmArguments)

    if ($script:UseCorepackPnpm) {
        & corepack pnpm @PnpmArguments
    }
    else {
        & pnpm @PnpmArguments
    }
    if ($LASTEXITCODE -ne 0) {
        throw "pnpm $($PnpmArguments -join ' ') failed with exit code $LASTEXITCODE."
    }
}

try {
    Set-Location -LiteralPath $Root

    Assert-Command -Name 'docker' -InstallHint 'Install Docker Desktop from https://www.docker.com/products/docker-desktop/, start it, then run this script again.'

    Write-Step "Checking that Docker is running"
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker is installed but not running. Start Docker Desktop, wait until it is ready, then run this script again."
    }

    Initialize-EnvFile -ProjectRoot $Root
    Enable-Pnpm

    Invoke-Native -Label "Starting Postgres" -Command { docker compose up -d --wait db }
    Write-Step "Installing dependencies"
    Invoke-Pnpm -PnpmArguments @('install')
    Write-Step "Generating Prisma client"
    Invoke-Pnpm -PnpmArguments @('db:generate')
    Write-Step "Applying database migrations"
    Invoke-Pnpm -PnpmArguments @('db:migrate')

    Write-Step "Starting the site at http://localhost:3000"
    Write-Host "Sign in at http://localhost:3000/signin. The magic link is printed in this window (email is not sent)."
    Write-Host "Press Ctrl+C to stop the site. The database keeps running until you run: docker compose down"
    Write-Host ""

    if ($script:UseCorepackPnpm) {
        & corepack pnpm dev
    }
    else {
        & pnpm dev
    }
    if ($LASTEXITCODE -ne 0) {
        throw "The dev server exited with code $LASTEXITCODE."
    }
}
catch {
    Write-Host ""
    Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
