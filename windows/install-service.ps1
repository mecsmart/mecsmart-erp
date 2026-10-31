# Registers MecSmart ERP as a background Windows service (Task Scheduler, SYSTEM account).
# - starts at boot, no user login required, keeps running after logoff / idle session timeout
# - auto-restarts on failure, no execution time limit
$ErrorActionPreference = 'Stop'
$TaskName = 'MecSmart ERP Server'
$here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$runner   = Join-Path $here 'service-run.bat'

if (-not (Test-Path $runner)) { throw "service-run.bat not found in $here" }

$action    = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" `
               -Argument ('/c ""' + $runner + '""') -WorkingDirectory $here
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet `
               -ExecutionTimeLimit ([TimeSpan]::Zero) `
               -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
               -MultipleInstances IgnoreNew `
               -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Description 'MecSmart ERP backend + web app (port 8001)' -Force | Out-Null

Write-Host "  Task '$TaskName' registered (runs as SYSTEM at boot)."
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 3
$state = (Get-ScheduledTask -TaskName $TaskName).State
Write-Host "  Current state: $state"
Write-Host ''
Write-Host 'MecSmart ERP now runs in the background and survives logoff.' -ForegroundColor Green
Write-Host 'Logs: data\logs\service.log and data\logs\backend.log'
