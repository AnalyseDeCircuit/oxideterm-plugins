# SPDX-License-Identifier: MIT

$ErrorActionPreference = "Stop"

$PluginRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ManifestPath = Join-Path $PluginRoot "plugin.json"
$Manifest = Get-Content -Raw $ManifestPath | ConvertFrom-Json

if ($Manifest.id -notmatch "^[a-z0-9][a-z0-9.-]*$") {
    throw "Invalid plugin id"
}
if ($Manifest.version -notmatch "^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$") {
    throw "Invalid plugin version"
}

$PackageIdentity = "$($Manifest.id)-$($Manifest.version)"
$DistDirectory = Join-Path $PluginRoot "dist"
$ArtifactPath = Join-Path $DistDirectory "$PackageIdentity.zip"
$PackageFiles = @("plugin.json", "README.md", "README.en.md", "LICENSE")

New-Item -ItemType Directory -Force $DistDirectory | Out-Null
if (Test-Path $ArtifactPath) {
    Remove-Item $ArtifactPath
}
$PackagePaths = $PackageFiles | ForEach-Object { Join-Path $PluginRoot $_ }
Compress-Archive -Path $PackagePaths -DestinationPath $ArtifactPath

$PackageDigest = (Get-FileHash -Algorithm SHA256 $ArtifactPath).Hash.ToLowerInvariant()
$PackageSize = (Get-Item $ArtifactPath).Length
Write-Output "Artifact: $ArtifactPath"
Write-Output "SHA-256: $PackageDigest"
Write-Output "Size: $PackageSize bytes"
