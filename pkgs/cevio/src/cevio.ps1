param([Parameter(Mandatory = $true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$m = [System.IO.File]::ReadAllText($Manifest, $utf8) | ConvertFrom-Json
function Save-Result($o) {
  [System.IO.File]::WriteAllText($m.result, (ConvertTo-Json -InputObject $o -Depth 5 -Compress), $utf8)
}
try {
  $dir = $m.dll_dir
  if (-not $dir) { $dir = Join-Path $env:ProgramFiles 'CeVIO\CeVIO AI' }
  Add-Type -Path (Join-Path $dir 'CeVIO.Talk.RemoteService2.dll')
  $r = [CeVIO.Talk.RemoteService2.ServiceControl2]::StartHost($false)
  if ($r -ne [CeVIO.Talk.RemoteService2.HostStartResult]::Succeeded) { throw "StartHost: $r" }
} catch {
  Save-Result @{ fatal = $_.Exception.Message }
  exit 2
}
$t = New-Object CeVIO.Talk.RemoteService2.Talker2
$res = New-Object System.Collections.ArrayList
foreach ($j in $m.jobs) {
  try {
    $t.Cast = $j.cast
    foreach ($k in 'Volume', 'Speed', 'Tone', 'Alpha', 'ToneScale') {
      $v = $j.$k
      if ($null -ne $v) { $t.$k = [uint32]$v }
    }
    if ($j.components) {
      foreach ($p in $j.components.PSObject.Properties) { $t.Components.ByName($p.Name).Value = [uint32]$p.Value }
    }
    if (-not $t.OutputWaveToFile($j.text, $j.out)) { throw 'OutputWaveToFile returned false' }
    [void]$res.Add(@{ id = $j.id; ok = $true })
  } catch {
    [void]$res.Add(@{ id = $j.id; ok = $false; error = $_.Exception.Message })
  }
}
Save-Result @{ jobs = $res }
