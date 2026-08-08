param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [switch]$Gui
)

$ErrorActionPreference = "Stop"
$resultPath = Join-Path ([IO.Path]::GetTempPath()) "opaija-replicate-token-setup.json"
$envPath = Join-Path $ProjectRoot ".env"
$examplePath = Join-Path $ProjectRoot ".env.example"
$secureToken = $null
$plainToken = $null
$tokenPointer = [IntPtr]::Zero

if (Test-Path -LiteralPath $resultPath) {
  Remove-Item -LiteralPath $resultPath -Force
}

function Save-Result([bool]$Ok, [string]$Status, [string]$Message) {
  @{
    ok = $Ok
    status = $Status
    message = $Message
    checkedAt = (Get-Date).ToUniversalTime().ToString("o")
  } | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
}

try {
  if ($Gui) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $form = [Windows.Forms.Form]::new()
    $form.Text = "OPAIJA Replicate Setup"
    $form.StartPosition = "CenterScreen"
    $form.TopMost = $true
    $form.ClientSize = [Drawing.Size]::new(540, 175)
    $form.FormBorderStyle = "FixedDialog"
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false

    $label = [Windows.Forms.Label]::new()
    $label.Text = "Paste the fresh Replicate API token. It will stay hidden."
    $label.AutoSize = $true
    $label.Location = [Drawing.Point]::new(20, 20)
    $form.Controls.Add($label)

    $tokenBox = [Windows.Forms.TextBox]::new()
    $tokenBox.Location = [Drawing.Point]::new(20, 55)
    $tokenBox.Size = [Drawing.Size]::new(500, 28)
    $tokenBox.UseSystemPasswordChar = $true
    $form.Controls.Add($tokenBox)

    $okButton = [Windows.Forms.Button]::new()
    $okButton.Text = "Validate and save"
    $okButton.Location = [Drawing.Point]::new(370, 110)
    $okButton.Size = [Drawing.Size]::new(150, 34)
    $okButton.DialogResult = [Windows.Forms.DialogResult]::OK
    $form.AcceptButton = $okButton
    $form.Controls.Add($okButton)

    $cancelButton = [Windows.Forms.Button]::new()
    $cancelButton.Text = "Cancel"
    $cancelButton.Location = [Drawing.Point]::new(265, 110)
    $cancelButton.Size = [Drawing.Size]::new(90, 34)
    $cancelButton.DialogResult = [Windows.Forms.DialogResult]::Cancel
    $form.CancelButton = $cancelButton
    $form.Controls.Add($cancelButton)

    $form.Add_Shown({ $tokenBox.Focus() })
    if ($form.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) {
      throw "Token setup was canceled."
    }
    $plainToken = $tokenBox.Text.Trim()
    $form.Dispose()
  } else {
    Write-Host "OPAIJA Replicate Setup" -ForegroundColor Cyan
    Write-Host "Paste the new Replicate API token below. The token will stay hidden." -ForegroundColor Gray
    $secureToken = Read-Host "Replicate token" -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    $plainToken = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
  }

  if ($plainToken -notmatch '^r8_[A-Za-z0-9_-]{20,}$') {
    throw "That does not look like a Replicate API token."
  }

  $accountResponse = Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "https://api.replicate.com/v1/account" `
    -Headers @{ Authorization = "Bearer $plainToken" } `
    -TimeoutSec 30

  if ($accountResponse.StatusCode -ne 200) {
    throw "Replicate rejected the token with HTTP $($accountResponse.StatusCode)."
  }

  $lines = if (Test-Path -LiteralPath $envPath) {
    [IO.File]::ReadAllLines($envPath)
  } elseif (Test-Path -LiteralPath $examplePath) {
    [IO.File]::ReadAllLines($examplePath)
  } else {
    @()
  }

  $found = $false
  $updatedLines = foreach ($line in $lines) {
    if ($line -match '^\s*REPLICATE_API_TOKEN\s*=') {
      $found = $true
      "REPLICATE_API_TOKEN=$plainToken"
    } else {
      $line
    }
  }
  if (-not $found) {
    $updatedLines = @($updatedLines) + "REPLICATE_API_TOKEN=$plainToken"
  }

  [IO.File]::WriteAllLines($envPath, [string[]]$updatedLines, [Text.UTF8Encoding]::new($false))
  Save-Result $true "configured" "Replicate token validated and saved to OPAIJA."
  Write-Host "Token validated and saved successfully." -ForegroundColor Green
} catch {
  Save-Result $false "failed" $_.Exception.Message
  Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
  if ($tokenPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
  }
  $plainToken = $null
  $secureToken = $null
}

if (-not $Gui) {
  Read-Host "Press Enter to close"
}
