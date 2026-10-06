<#
    Posts the synthetic invoices to the n8n invoice-intake webhook.

    The PDF goes up as the raw request body; the filename rides along as a
    query parameter, because a raw body carries no filename of its own.

    Usage:
      # with the workflow open in n8n and "Test workflow" clicked
      .\send-invoices.ps1 -Only invoice-05-large

      # against an activated (production) workflow
      .\send-invoices.ps1 -Production
#>
param(
    [switch]$Production,
    [string]$Only,
    [string]$BaseUrl = 'http://localhost:5678',
    [int]$DelaySeconds = 3
)

$ErrorActionPreference = 'Stop'

$path = if ($Production) { 'webhook' } else { 'webhook-test' }
$uri = "$BaseUrl/$path/invoice-intake"

$dir = Join-Path $PSScriptRoot 'invoices'
$manifest = Get-Content -Path (Join-Path $dir 'manifest.json') -Raw | ConvertFrom-Json

if ($Only) {
    $manifest = $manifest | Where-Object { $_.file -like "*$Only*" }
}
if (-not $manifest) { throw "No invoices matched." }

Write-Host "POSTing $($manifest.Count) invoice(s) to $uri`n"

foreach ($inv in $manifest) {
    $file = Join-Path $dir $inv.file
    if (-not (Test-Path $file)) {
        Write-Host "   SKIP (missing): $($inv.file)" -ForegroundColor DarkYellow
        continue
    }

    $qs = [uri]::EscapeDataString($inv.file)
    $target = "$uri`?source_file=$qs"

    Write-Host "-> $($inv.file)"
    Write-Host "   expected: $($inv.expected_status) - $($inv.why)" -ForegroundColor DarkGray

    try {
        $resp = Invoke-RestMethod -Uri $target -Method Post -InFile $file -ContentType 'application/pdf'

        $status = $resp.status
        $reason = $resp.flag_reason

        if ($status -eq $inv.expected_status) {
            Write-Host "   got: $status (as expected)" -ForegroundColor Green
        }
        elseif ($status) {
            Write-Host "   got: $status - EXPECTED $($inv.expected_status)" -ForegroundColor Yellow
        }
        else {
            Write-Host "   ok (no status in response - check the sheet)" -ForegroundColor DarkGray
        }

        if ($reason) { Write-Host "   flags: $reason" -ForegroundColor DarkGray }
    }
    catch {
        Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
        if (-not $Production) {
            Write-Host "   (test webhooks accept one call per 'Test workflow' click)" -ForegroundColor DarkGray
        }
    }

    Write-Host ''
    if ($DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }
}
