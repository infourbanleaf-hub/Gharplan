<#
GharPlan one-step setup for Windows PowerShell.

Checks Node.js and Git, gets the project (clones it if needed), installs packages,
runs the tests, and starts the web app in your browser's address bar.

Run from any folder:
  powershell -ExecutionPolicy Bypass -File .\setup.ps1

Optional:
  -Folder "C:\Dev\gharplan"          where the project lives (default: Documents\Gharplan)
  -Repo "https://github.com/..."     repository to clone if the folder is missing
  -SkipTests                         skip npm test and go straight to the web app
#>
param(
  [string]$Folder = (Join-Path $HOME 'Documents\Gharplan'),
  [string]$Repo = 'https://github.com/infourbanleaf-hub/Gharplan.git',
  [switch]$SkipTests
)

# Continue, not Stop: git and npm write normal progress to stderr, which would otherwise abort the script.
# Each native command's exit code is checked by Run instead.
$ErrorActionPreference = 'Continue'

function Step([string]$Message) {
  Write-Host ''
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Fail([string]$Message) {
  Write-Host ''
  Write-Host "ERROR: $Message" -ForegroundColor Red
  exit 1
}

function Run {
  param([string]$Exe, [string[]]$Arguments)
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail "'$Exe $($Arguments -join ' ')' failed (exit code $LASTEXITCODE). See the messages above."
  }
}

Step 'Checking Node.js, npm and Git'
foreach ($tool in @('node', 'npm.cmd', 'git')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Fail "$tool was not found. Install Node.js 22 LTS from nodejs.org and Git from git-scm.com, then open a new PowerShell window and run this again."
  }
}
$nodeVersion = (& node -v) 2>$null
Write-Host "Node $nodeVersion, npm $((& npm.cmd -v) 2>$null), $((& git --version) 2>$null)"
if ($nodeVersion -notmatch '^v(20|22)\.') {
  Write-Host "Warning: Node 20 or 22 is recommended. You have $nodeVersion." -ForegroundColor Yellow
}

Step 'Getting the project'
if (Test-Path (Join-Path $Folder 'package.json')) {
  Write-Host "Project found at $Folder"
} elseif (Test-Path $Folder) {
  $existing = Get-ChildItem -Force -Path $Folder -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($existing) {
    Fail "$Folder already exists and is not a GharPlan project. Pass a different folder with -Folder."
  }
  Run -Exe 'git' -Arguments @('clone', $Repo, $Folder)
} else {
  $parent = Split-Path -Parent $Folder
  New-Item -ItemType Directory -Force -Path $parent | Out-Null
  Run -Exe 'git' -Arguments @('clone', $Repo, $Folder)
}

Set-Location -Path $Folder
Write-Host "Working in $(Get-Location)"

Step 'Installing packages (this takes a few minutes the first time)'
Run -Exe 'npm.cmd' -Arguments @('install', '--fetch-retries=5', '--fetch-retry-mintimeout=20000')

if ($SkipTests) {
  Write-Host 'Skipping tests (-SkipTests).'
} else {
  Step 'Running the tests (about a minute or two)'
  Run -Exe 'npm.cmd' -Arguments @('test')
}

Step 'Starting the web app'
Write-Host 'When Expo prints an address, open it in your browser.'
Write-Host 'Press Ctrl+C in this window to stop the app.'
Run -Exe 'npm.cmd' -Arguments @('run', 'web')
