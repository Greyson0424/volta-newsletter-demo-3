$ErrorActionPreference = "Stop"

$pluginPath = Join-Path $PSScriptRoot "plugins\volta-newsletter"
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 20 or newer is required."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm is required."
}

npm ci --ignore-scripts --prefix $pluginPath
npm test --prefix $pluginPath

Write-Host ""
Write-Host "VOLTA Newsletter is ready."
Write-Host "Codex: open this folder, start a new task, and type: newsletter"
Write-Host "Claude Code or Cursor: open this folder, type newsletter, then run .\studio.ps1 for the visual editor."
