param(
    [string]$WorkingDir = "C:\Users\Banjo\OneDrive\Documents\Opaija",
    [string]$HealthUrl = "http://127.0.0.1:8787/command/api/book-builder/health",
    [int]$WaitSeconds = 120
)

$ErrorActionPreference = "Stop"

Set-Location $WorkingDir

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
}

docker compose up -d --build opaija-book-builder

$deadline = (Get-Date).AddSeconds($WaitSeconds)
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            Write-Output "Book Builder health check passed: $HealthUrl"
            Write-Output $response.Content
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}

if ((Get-Date) -ge $deadline) {
    throw "Health check timed out after $WaitSeconds seconds for $HealthUrl"
}

Write-Output "Run command dashboard: http://127.0.0.1:8787/command"
