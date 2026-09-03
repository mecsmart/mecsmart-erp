# Creates Desktop shortcuts for the MecSmart ERP launcher scripts.
$ErrorActionPreference = 'Stop'
$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$root    = (Resolve-Path (Join-Path $here '..')).Path
$desktop = [Environment]::GetFolderPath('Desktop')
$shell   = New-Object -ComObject WScript.Shell

$icoCandidate = Join-Path $root 'desktop\build\icon.ico'
$icon = if (Test-Path $icoCandidate) { $icoCandidate } else { "$env:SystemRoot\System32\shell32.dll,15" }
$stopIcon = "$env:SystemRoot\System32\shell32.dll,27"

$shortcuts = @(
  @{ Name = 'MecSmart ERP Server';       Target = 'start-prod.bat'; Desc = 'Start MecSmart ERP (production, port 8001)'; Icon = $icon },
  @{ Name = 'MecSmart ERP (Dev)';        Target = 'start-dev.bat';  Desc = 'Start MecSmart ERP with hot reload';          Icon = $icon },
  @{ Name = 'Stop MecSmart ERP';         Target = 'stop-erp.bat';   Desc = 'Stop all MecSmart ERP services';             Icon = $stopIcon }
)

foreach ($s in $shortcuts) {
  $lnk = $shell.CreateShortcut((Join-Path $desktop ($s.Name + '.lnk')))
  $lnk.TargetPath       = "$env:SystemRoot\System32\cmd.exe"
  $lnk.Arguments        = '/c ""' + (Join-Path $here $s.Target) + '""'
  $lnk.WorkingDirectory = $here
  $lnk.Description      = $s.Desc
  $lnk.IconLocation     = $s.Icon
  $lnk.WindowStyle      = 1
  $lnk.Save()
  Write-Host ("  created  " + $s.Name + ".lnk")
}

Write-Host ''
Write-Host 'Desktop shortcuts created.' -ForegroundColor Green
