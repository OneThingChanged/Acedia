param(
  [string]$AssetDirectory = (Join-Path $PSScriptRoot '../electron-dist'),
  [string]$SourceCommit = $env:GITHUB_SHA,
  [switch]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$repository = 'OneThingChanged/Acedia'
$package = Get-Content -LiteralPath (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json
$version = $package.multiAgentReleaseVersion
if ($version -notmatch '^\d+\.\d+\.\d+\.\d+$') { throw 'A four-part release version is required.' }
$tag = "v$version"
$assetRoot = [IO.Path]::GetFullPath($AssetDirectory)
$manifestPath = Join-Path $assetRoot 'latest-exe.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$installerName = "Acedia-Setup-$version-x64.exe"
$installerPath = Join-Path $assetRoot $installerName
$installer = Get-Item -LiteralPath $installerPath
$installerHash = (Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash.ToLowerInvariant()
if ($manifest.schemaVersion -ne 1 -or $manifest.channel -ne 'exe' -or
    $manifest.version -ne $version -or $manifest.fileName -ne $installerName -or
    $manifest.size -ne $installer.Length -or $manifest.sha256 -ne $installerHash -or
    $manifest.bundledMobileVersion -notmatch '^\d+\.\d+\.\d+\.\d+$' -or
    $installer.VersionInfo.FileVersion -ne $version) {
  throw 'Installer version, size or hash does not match the EXE manifest.'
}
$blockmapPath = "$installerPath.blockmap"
if ((Get-Item -LiteralPath $blockmapPath).Length -le 0) { throw 'Installer blockmap is empty.' }
$assets = @($installerPath, $blockmapPath, $manifestPath)
$signature = Get-AuthenticodeSignature -LiteralPath $installerPath
Write-Output "Verified $installerName ($($installer.Length) bytes, SHA-256 $installerHash, Authenticode $($signature.Status))."
if ($VerifyOnly) { return }
if ($SourceCommit -notmatch '^[0-9a-f]{40}$') { throw 'The exact source commit is required for publication.' }

function Invoke-GithubCli {
  param([string[]]$Arguments)
  $output = & gh @Arguments
  if ($LASTEXITCODE -ne 0) { throw "GitHub CLI failed: $($Arguments[0])" }
  return $output
}

$existingJson = & gh api "repos/$repository/releases/tags/$tag" 2>$null
if ($LASTEXITCODE -eq 0) {
  $existing = ($existingJson -join "`n") | ConvertFrom-Json
  if (-not $existing.draft -or $existing.prerelease -or $existing.target_commitish -ne $SourceCommit) {
    throw 'An existing release must be a draft for this exact source commit.'
  }
} else {
  $documentPath = Join-Path $PSScriptRoot "../../docs/release-$($version.Replace('.', '-')).md"
  $document = Get-Content -LiteralPath $documentPath -Raw
  $notes = [regex]::Replace($document, '(?s)\A---\r?\n.*?\r?\n---\r?\n', '')
  $notes = ($notes -split '\r?\n## 검증')[0].Trim()
  $notesPath = Join-Path $env:TEMP "acedia-$version-release-notes.md"
  Set-Content -LiteralPath $notesPath -Value $notes -Encoding utf8
  Invoke-GithubCli -Arguments @('release', 'create', $tag, '--repo', $repository, '--target', $SourceCommit,
    '--draft', '--title', "Acedia $version", '--notes-file', $notesPath)
}
Invoke-GithubCli -Arguments (@('release', 'upload', $tag, '--repo', $repository, '--clobber') + $assets)
$uploaded = ((Invoke-GithubCli -Arguments @('api', "repos/$repository/releases/tags/$tag")) -join "`n") | ConvertFrom-Json
if (-not $uploaded.draft -or $uploaded.target_commitish -ne $SourceCommit -or $uploaded.assets.Count -ne $assets.Count) {
  throw 'Draft release target or asset set does not match the verified build.'
}
foreach ($assetPath in $assets) {
  $local = Get-Item -LiteralPath $assetPath
  $remote = @($uploaded.assets | Where-Object name -eq $local.Name)
  $hash = (Get-FileHash -LiteralPath $assetPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($remote.Count -ne 1 -or $remote[0].size -ne $local.Length -or $remote[0].digest -ne "sha256:$hash") {
    throw "Uploaded asset does not match local bytes: $($local.Name)"
  }
}
$tagRef = ((Invoke-GithubCli -Arguments @('api', "repos/$repository/git/ref/tags/$tag")) -join "`n") | ConvertFrom-Json
if ($tagRef.object.type -ne 'commit' -or $tagRef.object.sha -ne $SourceCommit) { throw 'Release tag does not point to the build source commit.' }
Invoke-GithubCli -Arguments @('release', 'edit', $tag, '--repo', $repository, '--draft=false', '--prerelease=false', '--latest')
$published = ((Invoke-GithubCli -Arguments @('api', "repos/$repository/releases/tags/$tag")) -join "`n") | ConvertFrom-Json
if ($published.draft -or $published.prerelease -or -not $published.published_at) { throw 'Stable publication was not confirmed.' }
Write-Output "Published $($published.html_url) from $SourceCommit."
