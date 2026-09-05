$ErrorActionPreference = 'Stop'

$nodeVersion = '22.23.2'
$expectedHash = '0d0f5e39f9f3d9587bc19f73eab3c2c9c4903fd02d6dbf9c853dd81b3d95fad4'
$projectRoot = Split-Path -Parent $PSScriptRoot
$binaryDirectory = Join-Path $projectRoot 'src-tauri\binaries'
$target = Join-Path $binaryDirectory 'node-x86_64-pc-windows-msvc.exe'
$download = Join-Path ([System.IO.Path]::GetTempPath()) "seoautopilot-node-$nodeVersion.exe"

function Get-Sha256([string]$Path) {
  $stream = [System.IO.File]::OpenRead($Path)
  try {
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
      return ([System.BitConverter]::ToString($sha256.ComputeHash($stream))).Replace('-', '').ToLowerInvariant()
    } finally {
      $sha256.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

New-Item -ItemType Directory -Force -Path $binaryDirectory | Out-Null

if (Test-Path -LiteralPath $target) {
  $currentHash = Get-Sha256 $target
  if ($currentHash -eq $expectedHash) {
    Write-Host "Verified Node.js sidecar already exists: $target"
    exit 0
  }
  Remove-Item -LiteralPath $target -Force
}

$url = "https://nodejs.org/dist/v$nodeVersion/win-x64/node.exe"
$reuseDownload = $false
if (Test-Path -LiteralPath $download) {
  $cachedHash = Get-Sha256 $download
  $reuseDownload = $cachedHash -eq $expectedHash
}
if (-not $reuseDownload) {
  Write-Host "Downloading official Node.js v$nodeVersion sidecar..."
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $download
} else {
  Write-Host "Using verified Node.js download cache."
}
$downloadHash = Get-Sha256 $download
if ($downloadHash -ne $expectedHash) {
  Remove-Item -LiteralPath $download -Force -ErrorAction SilentlyContinue
  throw "Node.js checksum mismatch. Expected $expectedHash, got $downloadHash."
}

Move-Item -LiteralPath $download -Destination $target -Force
Write-Host "Verified official Node.js sidecar: $target"
