param([Parameter(Mandatory)][ValidateSet('worker','monitor')][string]$Kind)
$ErrorActionPreference = 'Stop'
$stateRoot = Join-Path $env:LOCALAPPDATA 'Acedia\store-release'
[IO.Directory]::CreateDirectory($stateRoot) | Out-Null
$runner = Join-Path $PSScriptRoot 'release-store.mjs'
$log = Join-Path $stateRoot ("scheduled-{0}-{1}.log" -f $Kind, (Get-Date -Format 'yyyyMMdd'))
try {
  # Task scheduler launches this host with -WindowStyle Hidden. WACK itself may show its test UI.
  & node.exe $runner $Kind *>> $log
  exit $LASTEXITCODE
} catch {
  ('Scheduled Store task failed: ' + $_.Exception.Message) | Add-Content -LiteralPath $log
  exit 1
}
