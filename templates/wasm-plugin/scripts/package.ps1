# SPDX-License-Identifier: MIT

$ErrorActionPreference = "Stop"

$PluginRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ManifestPath = Join-Path $PluginRoot "plugin.json"
$Manifest = Get-Content -Raw $ManifestPath | ConvertFrom-Json
$DistDirectory = Join-Path $PluginRoot "dist"
$ArtifactPath = Join-Path $DistDirectory "$($Manifest.id)-$($Manifest.version).zip"
$BuiltModule = Join-Path $PluginRoot "target/wasm32-wasip1/release/plugin.wasm"
$PackagedModule = Join-Path $PluginRoot "plugin.wasm"

node (Join-Path $PSScriptRoot "check.mjs")
Push-Location $PluginRoot
try {
    cargo fmt --all -- --check
    cargo build --release --target wasm32-wasip1
}
finally {
    Pop-Location
}
Copy-Item $BuiltModule $PackagedModule -Force

New-Item -ItemType Directory -Force $DistDirectory | Out-Null
if (Test-Path $ArtifactPath) {
    Remove-Item $ArtifactPath
}
$PackageFiles = @("plugin.json", "plugin.wasm", "README.md", "README.en.md", "LICENSE")
$PackagePaths = $PackageFiles | ForEach-Object { Join-Path $PluginRoot $_ }
Compress-Archive -Path $PackagePaths -DestinationPath $ArtifactPath

$PackageDigest = (Get-FileHash -Algorithm SHA256 $ArtifactPath).Hash.ToLowerInvariant()
$PackageSize = (Get-Item $ArtifactPath).Length
Write-Output "Artifact: $ArtifactPath"
Write-Output "SHA-256: $PackageDigest"
Write-Output "Size: $PackageSize bytes"
