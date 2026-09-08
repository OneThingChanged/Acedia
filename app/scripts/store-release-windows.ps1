param(
  [Parameter(Mandatory)][ValidateSet('ReadCredentials','TaskStatus','StartWorker','ZipPackage','ValidateWack')][string]$Action,
  [string]$StateRoot,
  [string]$InputPath,
  [string]$OutputPath,
  [string]$ExpectedVersion,
  [string]$ExpectedIdentity
)
$ErrorActionPreference = 'Stop'
switch ($Action) {
  'ReadCredentials' {
    $record = Import-Clixml -LiteralPath (Join-Path $StateRoot 'credentials.xml')
    $credential = [pscredential]::new('store', $record.ClientSecret)
    @{ tenantId = $record.TenantId; clientId = $record.ClientId; clientSecret = $credential.GetNetworkCredential().Password } | ConvertTo-Json -Compress
  }
  'TaskStatus' {
    $result = @{}
    foreach ($taskName in @('Acedia Store Release Worker', 'Acedia Store Release Monitor')) {
      $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
      $result[$taskName] = if ($task) { [string]$task.State } else { 'NotInstalled' }
    }
    $result | ConvertTo-Json -Compress
  }
  'StartWorker' { Start-ScheduledTask -TaskName 'Acedia Store Release Worker' }
  'ZipPackage' {
    Add-Type -AssemblyName System.IO.Compression
    $source = (Resolve-Path -LiteralPath $InputPath).Path
    $destination = [IO.Path]::GetFullPath($OutputPath)
    if ([IO.Path]::GetExtension($source) -ne '.msix' -or [IO.Path]::GetExtension($destination) -ne '.zip') { throw 'Expected MSIX and ZIP paths.' }
    # CreateNew prevents silently replacing a previous release archive.
    $stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
    try {
      $archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create, $true)
      try { [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $source, [IO.Path]::GetFileName($source), [IO.Compression.CompressionLevel]::NoCompression) | Out-Null }
      finally { $archive.Dispose() }
    } finally { $stream.Dispose() }
  }
  'ValidateWack' {
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
    $settings.XmlResolver = $null
    $reader = [Xml.XmlReader]::Create((Resolve-Path -LiteralPath $InputPath).Path, $settings)
    try { $report = [Xml.XmlDocument]::new(); $report.XmlResolver = $null; $report.Load($reader) } finally { $reader.Dispose() }
    $root = $report.DocumentElement
    if ($root.LocalName -ne 'REPORT' -or $root.GetAttribute('OVERALL_RESULT') -ne 'PASS' -or $root.GetAttribute('PARTIAL_RUN') -ne 'FALSE') { throw 'WACK overall result must be PASS for a full run.' }
    if (-not $ExpectedVersion -or -not $ExpectedIdentity -or $root.GetAttribute('APP_VERSION') -ne $ExpectedVersion -or $root.GetAttribute('APP_NAME') -ne $ExpectedIdentity) { throw 'WACK report package version or identity mismatch.' }
    # Desktop Bridge OPTIONAL tests are informational. Inspect actual TEST results,
    # not diagnostic STATUS nodes embedded elsewhere in the report.
    $tests = @($report.SelectNodes('/REPORT/REQUIREMENTS/REQUIREMENT/TEST'))
    $required = @($tests | Where-Object { $_.GetAttribute('OPTIONAL') -ne 'TRUE' })
    if ($required.Count -eq 0) { throw 'Unrecognized WACK report: no required tests.' }
    foreach ($test in $required) {
      $result = $test.SelectSingleNode('RESULT')
      if (-not $result -or $result.InnerText.Trim() -ne 'PASS') { throw ('Required WACK test did not pass: ' + $test.GetAttribute('NAME')) }
    }
    $warnings = @($tests | Where-Object { $_.GetAttribute('OPTIONAL') -eq 'TRUE' -and $_.SelectSingleNode('RESULT').InnerText.Trim() -ne 'PASS' } | ForEach-Object { $_.GetAttribute('NAME') })
    if ($warnings.Count) { 'WACK_OPTIONAL_WARNINGS=' + ($warnings | ConvertTo-Json -Compress -AsArray) }
    'WACK_REPORT_VALID'
  }
}
