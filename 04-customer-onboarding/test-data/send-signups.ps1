<#
    Sends the synthetic signups to the n8n onboarding webhook, one at a time.

    The signup page sends one signup at a time. This fills both sheets in
    one go.

    Usage:
      # while the workflow is open in n8n and you clicked "Test workflow"
      .\send-signups.ps1

      # against a published (production) workflow
      .\send-signups.ps1 -Production

      # a single signup
      .\send-signups.ps1 -Production -Only SU-DEMO-05
#>
param(
    [switch]$Production,
    [string]$Only,
    [string]$BaseUrl = 'http://localhost:5678',
    [int]$DelaySeconds = 3
)

$ErrorActionPreference = 'Stop'

$path = if ($Production) { 'webhook' } else { 'webhook-test' }
$uri = "$BaseUrl/$path/customer-signup"

$signups = Get-Content -Path (Join-Path $PSScriptRoot 'signups.json') -Raw | ConvertFrom-Json
if ($Only) { $signups = $signups | Where-Object { $_.signup_id -eq $Only } }
if (-not $signups) { throw "No signups matched." }

Write-Host "POSTing $($signups.Count) signup(s) to $uri`n"

foreach ($s in $signups) {
    # strip the _expected annotations - they are documentation, not payload.
    # signup_id is passed so a re-run overwrites nothing and the rows stay
    # easy to find; the workflow mints its own when the field is absent,
    # which is what the signup page does.
    $payload = @{
        signup_id            = $s.signup_id
        company_name         = $s.company_name
        contact_name         = $s.contact_name
        contact_email        = $s.contact_email
        employee_count       = $s.employee_count
        business_description = $s.business_description
    } | ConvertTo-Json -Depth 4

    Write-Host "-> $($s.signup_id)  $($s.company_name)"
    Write-Host "   expected: $($s._expected)" -ForegroundColor DarkGray

    try {
        $resp = Invoke-RestMethod -Uri $uri -Method Post -Body $payload -ContentType 'application/json'
        # The workflow answers with a bare acknowledgement on purpose - the
        # classification is internal. Check the sheets, not this line.
        Write-Host "   ok: $($resp | ConvertTo-Json -Compress)" -ForegroundColor Green
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

Write-Host "Done. Expect $($signups.Count) rows in 'customers' and roughly $($signups.Count * 4) in 'onboarding_tasks'." -ForegroundColor Cyan
