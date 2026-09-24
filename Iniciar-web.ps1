$ErrorActionPreference = 'Stop'
$webDirectory = Join-Path $PSScriptRoot 'web'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$bundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'

if ($nodeCommand) {
    $nodeExecutable = $nodeCommand.Source
} elseif (Test-Path -LiteralPath $bundledNode) {
    $nodeExecutable = $bundledNode
} else {
    throw 'No se encontró Node.js. Instala Node.js 24.x y sigue web/README.md.'
}

if (-not (Test-Path -LiteralPath (Join-Path $webDirectory 'node_modules\next\dist\bin\next'))) {
    throw 'Faltan dependencias. Sigue las instrucciones de instalación en web/README.md.'
}

Push-Location -LiteralPath $webDirectory
try {
    Write-Host 'Iniciando BIM + IA. Abre la dirección local que indique el servidor. Ctrl+C para detener.'
    & $nodeExecutable node_modules/next/dist/bin/next dev --port 5173 --hostname 127.0.0.1
} finally {
    Pop-Location
}
