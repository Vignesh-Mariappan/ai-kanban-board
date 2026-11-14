$ErrorActionPreference = 'Stop'

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ContainerName = 'project-management-mvp'
$ImageName = 'project-management-mvp'
$Port = if ($env:PORT) { $env:PORT } else { '8000' }
$DatabaseDirectory = Join-Path $ProjectRoot 'data'
New-Item -ItemType Directory -Force -Path $DatabaseDirectory | Out-Null

function Wait-ForReady {
    for ($Attempt = 0; $Attempt -lt 30; $Attempt++) {
        try {
            $Health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 1
            if ($Health.status -eq 'ok') { return }
        } catch {
            Start-Sleep -Seconds 1
        }
    }

    docker logs $ContainerName
    docker stop $ContainerName | Out-Null
    throw "Container did not become ready on port $Port."
}

$RunningContainer = docker ps --filter "name=^/$ContainerName$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Unable to query Docker. Is Docker running?' }
if ($RunningContainer -contains $ContainerName) {
    Wait-ForReady
    Write-Output "Container $ContainerName is already running."
    return
}

$ExistingContainer = docker ps -a --filter "name=^/$ContainerName$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Unable to query Docker. Is Docker running?' }
if ($ExistingContainer -contains $ContainerName) {
    docker rm $ContainerName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to remove the stopped app container.' }
}

$DockerArguments = @(
    'run', '-d', '--name', $ContainerName,
    '-p', "${Port}:8000",
    '--mount', "type=bind,source=$DatabaseDirectory,target=/data"
)
$EnvFile = Join-Path $ProjectRoot '.env'
if (Test-Path $EnvFile) {
    $DockerArguments += @('--env-file', $EnvFile)
}
$DockerArguments += $ImageName

& docker @DockerArguments
if ($LASTEXITCODE -ne 0) { throw 'Unable to start the app container.' }
Wait-ForReady
Write-Output "App available at http://localhost:$Port"