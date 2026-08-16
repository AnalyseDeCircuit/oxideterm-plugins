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

$PackageIdentity = "$($Manifest.id)-$($Manifest.version)-windows"
$DistDirectory = Join-Path $PluginRoot "dist"
$ArtifactPath = Join-Path $DistDirectory "$PackageIdentity.zip"
$StagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())

New-Item -ItemType Directory -Force $DistDirectory | Out-Null
New-Item -ItemType Directory -Force $StagingDirectory | Out-Null

try {
    Copy-Item (Join-Path $PluginRoot "bin") $StagingDirectory -Recurse
    Copy-Item (Join-Path $PluginRoot "README.md") $StagingDirectory
    Copy-Item (Join-Path $PluginRoot "README.en.md") $StagingDirectory
    Copy-Item (Join-Path $PluginRoot "LICENSE") $StagingDirectory

    # Windows packages use a cmd.exe launcher while retaining the shared JS runtime.
    $Manifest.runtime.entry = "bin/plugin.cmd"
    $ManifestJson = $Manifest | ConvertTo-Json -Depth 100
    $Utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText(
        (Join-Path $StagingDirectory "plugin.json"),
        $ManifestJson,
        $Utf8WithoutBom
    )

    if (Test-Path $ArtifactPath) {
        Remove-Item $ArtifactPath
    }
    Compress-Archive -Path (Join-Path $StagingDirectory "*") -DestinationPath $ArtifactPath

    $PackageDigest = (Get-FileHash -Algorithm SHA256 $ArtifactPath).Hash.ToLowerInvariant()
    $PackageSize = (Get-Item $ArtifactPath).Length
    Write-Output "Artifact: $ArtifactPath"
    Write-Output "SHA-256: $PackageDigest"
    Write-Output "Size: $PackageSize bytes"
}
finally {
    Remove-Item $StagingDirectory -Recurse -Force
}
