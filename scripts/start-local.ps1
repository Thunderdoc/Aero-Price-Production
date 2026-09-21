# Starts the AeroPrice frontend and API locally. Safe to run repeatedly.
$projectRoot = Split-Path -Parent $PSScriptRoot

function Test-LocalPort([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-LocalPort 8000)) {
  $python = Join-Path $projectRoot 'backend\.venv\Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $python)) { $python = 'python' }
  Start-Process -FilePath $python -ArgumentList '-m','uvicorn','main:app','--host','127.0.0.1','--port','8000' `
    -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden
}

if (-not (Test-LocalPort 8443)) {
  Start-Process -FilePath 'pnpm.cmd' -ArgumentList 'dev' -WorkingDirectory $projectRoot -WindowStyle Hidden
}

Write-Host 'AeroPrice local services are running: http://localhost:8443 and http://127.0.0.1:8000/docs'
