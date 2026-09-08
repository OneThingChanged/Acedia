param(
  [switch]$ConfigureCredentials,
  [switch]$InstallTasks,
  [switch]$UninstallTasks
)
$ErrorActionPreference = 'Stop'
$stateRoot = Join-Path $env:LOCALAPPDATA 'Acedia\store-release'
$taskRunner = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'store-release-task.ps1')).Path
$pwsh = (Get-Command pwsh.exe -ErrorAction Stop).Source
trap {
  [IO.Directory]::CreateDirectory($stateRoot) | Out-Null
  @{ success = $false; at = (Get-Date).ToString('o'); error = $_.Exception.Message } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot 'setup-result.json')
  Write-Error $_ -ErrorAction Continue
  exit 1
}
if (-not ($ConfigureCredentials -or $InstallTasks -or $UninstallTasks)) {
  Write-Output 'Use -ConfigureCredentials for Entra credentials; -InstallTasks in elevated PowerShell for background execution.'
  exit 0
}
if ($ConfigureCredentials) {
  $tenantId = Read-Host 'Microsoft Entra Tenant ID'
  $clientId = Read-Host 'Microsoft Entra Application (client) ID'
  if ($tenantId -notmatch '^[0-9a-fA-F-]{36}$' -or $clientId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Expected GUID IDs.' }
  $secret = Read-Host 'Client secret VALUE (hidden; not secret ID)' -AsSecureString
  if ($secret.Length -eq 0) { throw 'Client secret cannot be empty.' }
  [IO.Directory]::CreateDirectory($stateRoot) | Out-Null
  $record = [pscustomobject]@{ TenantId = $tenantId; ClientId = $clientId; ClientSecret = $secret }
  $record | Export-Clixml -LiteralPath (Join-Path $stateRoot 'credentials.xml')
  # SecureString uses Windows DPAPI: this Windows user on this computer only.
  Write-Output 'Store credentials stored with Windows DPAPI. Run npm run release:store -- doctor --online to verify.'
}
if ($InstallTasks -or $UninstallTasks) {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Task setup requires an elevated PowerShell under the SAME Windows user who configured credentials.' }
  foreach ($kind in @('Worker','Monitor')) {
    $name = "Acedia Store Release $kind"
    $existing = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if ($existing -and $existing.Description -ne 'Acedia Store release automation (project-owned)') { throw "Task name belongs to another owner: $name" }
    if ($UninstallTasks) {
      if ($existing) { Unregister-ScheduledTask -TaskName $name -Confirm:$false }
      continue
    }
    $action = New-ScheduledTaskAction -Execute $pwsh -Argument ('-NoLogo -NoProfile -WindowStyle Hidden -File "{0}" -Kind {1}' -f $taskRunner, $kind.ToLowerInvariant()) -WorkingDirectory $PSScriptRoot
    # Interactive token is needed by WACK/GUI smoke tests. Jobs resume after login; no saved Windows password.
    $taskPrincipal = New-ScheduledTaskPrincipal -UserId $identity.Name -LogonType Interactive -RunLevel $(if ($kind -eq 'Worker') { 'Highest' } else { 'Limited' })
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 8) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $taskArgs = @{ Action = $action; Principal = $taskPrincipal; Settings = $settings; Description = 'Acedia Store release automation (project-owned)' }
    if ($kind -eq 'Monitor') {
      $taskArgs.Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 10)
    } else {
      $taskArgs.Trigger = New-ScheduledTaskTrigger -AtLogOn -User $identity.Name
    }
    Register-ScheduledTask -TaskName $name -InputObject (New-ScheduledTask @taskArgs) -Force | Out-Null
    Write-Output "Installed $name"
  }
}
[IO.Directory]::CreateDirectory($stateRoot) | Out-Null
@{ success = $true; at = (Get-Date).ToString('o'); credentialsConfigured = [bool]$ConfigureCredentials; tasksInstalled = [bool]$InstallTasks; tasksRemoved = [bool]$UninstallTasks } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stateRoot 'setup-result.json')
