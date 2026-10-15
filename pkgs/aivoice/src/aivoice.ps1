param([Parameter(Mandatory = $true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$m = [System.IO.File]::ReadAllText($Manifest, $utf8) | ConvertFrom-Json
function Save-Result($o) {
  [System.IO.File]::WriteAllText($m.result, (ConvertTo-Json -InputObject $o -Depth 5 -Compress), $utf8)
}
function Wait-Idle($t) {
  $until = (Get-Date).AddSeconds(60)
  while ($t.Status -eq 'Busy') {
    if ((Get-Date) -gt $until) { throw 'A.I.VOICE Editor stays busy' }
    Start-Sleep -Milliseconds 200
  }
}
try {
  $dir = $m.dll_dir
  if (-not $dir) { $dir = (Get-ItemProperty 'HKLM:\SOFTWARE\AI\AIVoice\AIVoiceEditor\1.0' -ErrorAction SilentlyContinue).InstallDir }
  if (-not $dir) { $dir = Join-Path $env:ProgramW6432 'AI\AIVoice\AIVoiceEditor' }
  Add-Type -Path (Join-Path $dir 'AI.Talk.Editor.Api.dll')
  $t = New-Object AI.Talk.Editor.Api.TtsControl
  $hosts = @($t.GetAvailableHostNames())
  if ($hosts.Count -eq 0) { throw 'no A.I.VOICE Editor to connect to' }
  $t.Initialize($hosts[0])
  if ($t.Status -eq 'NotRunning') { $t.StartHost() }
  for ($i = 0; ; $i++) {
    try { $t.Connect(); break } catch { if ($i -ge 30) { throw }; Start-Sleep -Seconds 1 }
  }
  Wait-Idle $t
  $presets = @($t.VoicePresetNames)
  $before = @{ mode = $t.TextEditMode; preset = $t.CurrentVoicePresetName; master = $t.MasterControl; text = $t.Text }
  $t.TextEditMode = 'Text'
} catch {
  Save-Result @{ fatal = $_.Exception.Message }
  exit 2
}
$res = New-Object System.Collections.ArrayList
foreach ($j in $m.jobs) {
  try {
    if ($presets -notcontains $j.voice) { throw ('no voice preset "' + $j.voice + '" (the presets: ' + ($presets -join ', ') + ')') }
    Wait-Idle $t
    $t.CurrentVoicePresetName = $j.voice
    $t.MasterControl = $j.master
    $t.Text = $j.text
    $t.SaveAudioToFile($j.out)
    [void]$res.Add(@{ id = $j.id; ok = $true })
  } catch {
    [void]$res.Add(@{ id = $j.id; ok = $false; error = $_.Exception.Message })
  }
}
try {
  $t.CurrentVoicePresetName = $before.preset
  $t.MasterControl = $before.master
  $t.Text = $before.text
  $t.TextEditMode = $before.mode
  $t.Disconnect()
} catch {}
Save-Result @{ jobs = $res }
