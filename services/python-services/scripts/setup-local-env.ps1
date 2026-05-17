param(
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceDir = Split-Path -Parent $scriptDir
$source = Join-Path $serviceDir "env.local.example"
$target = Join-Path $serviceDir ".env"

if ((Test-Path $target) -and -not $Force) {
  Write-Host "Local env already exists: $target"
  Write-Host "Use -Force to overwrite it from env.local.example."
  exit 0
}

Copy-Item -LiteralPath $source -Destination $target -Force
Write-Host "Created local Python services env: $target"
Write-Host "Edit provider credentials there if you need Supabase Storage, SendGrid, or Twilio locally."
