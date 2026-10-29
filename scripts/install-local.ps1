[CmdletBinding()]
param(
    [string]$PoiDataDirectory = (Join-Path $env:APPDATA 'poi')
)

$ErrorActionPreference = 'Stop'
$sourceDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$poiDirectory = [System.IO.Path]::GetFullPath($PoiDataDirectory)
$pluginParent = [System.IO.Path]::GetFullPath((Join-Path $poiDirectory 'plugins-extra\node_modules'))
$destination = [System.IO.Path]::GetFullPath((Join-Path $pluginParent 'poi-plugin-damage-shield'))
$expectedDestination = $pluginParent.TrimEnd('\') + '\poi-plugin-damage-shield'
if ($destination -ne $expectedDestination) { throw 'Unexpected plugin destination.' }
if (-not (Test-Path -LiteralPath $poiDirectory -PathType Container)) {
    throw "poi data directory does not exist: $poiDirectory"
}
if (Test-Path -LiteralPath $destination) {
    throw "Plugin already exists; no files were overwritten: $destination"
}

$payload = @('package.json', 'index.js', 'README.md', 'LICENSE', 'src\controller.js', 'src\game-shield.js', 'src\i18n.js',
    'i18n\zh-CN.json', 'i18n\zh-TW.json', 'i18n\ja-JP.json', 'i18n\en-US.json', 'i18n\ko-KR.json')
foreach ($relativePath in $payload) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceDirectory $relativePath) -PathType Leaf)) {
        throw "Missing source file: $relativePath"
    }
}

New-Item -ItemType Directory -Path (Join-Path $destination 'src') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $destination 'i18n') -Force | Out-Null
foreach ($relativePath in $payload) {
    Copy-Item -LiteralPath (Join-Path $sourceDirectory $relativePath) -Destination (Join-Path $destination $relativePath)
}
Write-Output "Installed: $destination"
Write-Output 'Restart poi and open the damage shield plugin to test it.'
