# Create .env from .env.example (if missing), replacing every CHANGE_ME with a random value. Called by run.bat.
# NOTE: keep this file ASCII-only. Windows PowerShell 5.1 reads BOM-less files as ANSI and breaks on UTF-8 Thai text.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (Test-Path ".env") {
    Write-Host ".env already exists - leaving it unchanged"
    exit 0
}

$rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
function New-Hex([int]$bytes) {
    $b = New-Object byte[] $bytes
    $rng.GetBytes($b)
    return (-join ($b | ForEach-Object { $_.ToString("x2") }))
}

$lines = Get-Content ".env.example" -Encoding UTF8 | ForEach-Object {
    $l = $_
    while ($l -match "CHANGE_ME_PW") { $l = ([regex]"CHANGE_ME_PW").Replace($l, (New-Hex 6), 1) }
    while ($l -match "CHANGE_ME") { $l = ([regex]"CHANGE_ME").Replace($l, (New-Hex 16), 1) }
    $l
}
[System.IO.File]::WriteAllLines((Join-Path (Get-Location) ".env"), $lines, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "Created .env (all secrets randomly generated)"
