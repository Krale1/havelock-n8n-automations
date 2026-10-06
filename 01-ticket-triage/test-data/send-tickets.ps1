<#
    Sends the mock support tickets to the n8n triage webhook, one at a time.

    Usage:
      # while the workflow is open in n8n and you clicked "Test workflow"
      .\send-tickets.ps1

      # against an activated (production) workflow
      .\send-tickets.ps1 -Production

      # a single ticket
      .\send-tickets.ps1 -Only TKT-1004
#>
param(
    [switch]$Production,
    [string]$Only,
    [string]$BaseUrl = 'http://localhost:5678',
    [int]$DelaySeconds = 2
)

$ErrorActionPreference = 'Stop'

$path = if ($Production) { 'webhook' } else { 'webhook-test' }
$uri = "$BaseUrl/$path/ticket-triage"

$tickets = Get-Content -Path (Join-Path $PSScriptRoot 'tickets.json') -Raw | ConvertFrom-Json
if ($Only) { $tickets = $tickets | Where-Object { $_.ticket_id -eq $Only } }
if (-not $tickets) { throw "No tickets matched." }

Write-Host "POSTing $($tickets.Count) ticket(s) to $uri`n"

foreach ($t in $tickets) {
    # strip the _expected annotation - it is documentation, not payload
    $payload = @{
        ticket_id      = $t.ticket_id
        customer_email = $t.customer_email
        subject        = $t.subject
        body           = $t.body
    } | ConvertTo-Json -Depth 4

    Write-Host "-> $($t.ticket_id)  $($t.subject)"
    Write-Host "   expected: $($t._expected)" -ForegroundColor DarkGray

    try {
        $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $payload -ContentType 'application/json'
        $line = $resp | ConvertTo-Json -Depth 4 -Compress
        if ($line.Length -gt 300) { $line = $line.Substring(0, 300) + '...' }
        Write-Host "   ok: $line" -ForegroundColor Green
    }
    catch {
        Write-Host "   FAILED: $($_.Exception.Message)" -ForegroundColor Red
        if (-not $Production) {
            Write-Host "   (test webhooks only accept one call per 'Test workflow' click)" -ForegroundColor DarkGray
        }
    }

    Write-Host ''
    if ($DelaySeconds -gt 0) { Start-Sleep -Seconds $DelaySeconds }
}
