$ErrorActionPreference = 'Stop'

$ContainerName = 'project-management-mvp'
$RunningContainer = docker ps --filter "name=^/$ContainerName$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) { throw 'Unable to query Docker. Is Docker running?' }

if ($RunningContainer -contains $ContainerName) {
    docker stop $ContainerName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to stop the app container.' }
    Write-Output "Container $ContainerName stopped."
} else {
    Write-Output "Container $ContainerName is not running."
}