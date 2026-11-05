$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class BitoWindows {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct InputInfo { public uint Size, Tick; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref InputInfo value);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetTopWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint cmd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h, int a, out Rect r, int n);
  [DllImport("dwmapi.dll", EntryPoint="DwmGetWindowAttribute")] public static extern int Cloaked(IntPtr h, int a, out int value, int n);
}
'@
$excluded = [int]$args[0]
function Read-Window {
  $result = $null
  for ($h = [BitoWindows]::GetTopWindow([IntPtr]::Zero); $h -ne [IntPtr]::Zero; $h = [BitoWindows]::GetWindow($h, 2)) {
    if (-not [BitoWindows]::IsWindowVisible($h)) { continue }
    [uint32]$owner = 0
    [void][BitoWindows]::GetWindowThreadProcessId($h, [ref]$owner)
    if ($owner -eq $excluded) { continue }
    [int]$cloaked = 0
    [void][BitoWindows]::Cloaked($h, 14, [ref]$cloaked, 4)
    if ($cloaked -ne 0) { continue }
    $class = New-Object Text.StringBuilder 256
    [void][BitoWindows]::GetClassName($h, $class, 256)
    if ($class.ToString() -in @('Shell_TrayWnd', 'Progman', 'WorkerW')) { continue }
    $r = New-Object BitoWindows+Rect
    if ([BitoWindows]::DwmGetWindowAttribute($h, 9, [ref]$r, 16) -ne 0) { continue }
    if (($r.Right-$r.Left) -lt 100 -or ($r.Bottom-$r.Top) -lt 70) { continue }
    $title = New-Object Text.StringBuilder 1024
    [void][BitoWindows]::GetWindowText($h, $title, 1024)
    $processName = (Get-Process -Id $owner -ErrorAction SilentlyContinue).ProcessName
    $result = @{ id=$h.ToInt64().ToString(); pid=$owner; app=$processName; title=$title.ToString(); bounds=@{x=$r.Left;y=$r.Top;width=($r.Right-$r.Left);height=($r.Bottom-$r.Top)} }
    break
  }
  return $result
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
function Observe-Interface([int]$targetPid) {
  [uint32]$frontPid = 0
  [void][BitoWindows]::GetWindowThreadProcessId([BitoWindows]::GetForegroundWindow(), [ref]$frontPid)
  $inputInfo = New-Object BitoWindows+InputInfo
  $inputInfo.Size = 8
  [void][BitoWindows]::GetLastInputInfo([ref]$inputInfo)
  $items = New-Object 'System.Collections.Generic.List[object]'
  $watch = [Diagnostics.Stopwatch]::StartNew()
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $roles = @('Button','MenuItem','Hyperlink','Edit','CheckBox','RadioButton','TabItem','ComboBox','TreeItem')
  function Walk-Interface($node, [string]$path, [int]$depth) {
    if ($null -eq $node -or $depth -gt 12 -or $items.Count -ge 180 -or $watch.ElapsedMilliseconds -gt 250) { return }
    try {
      $value = $node.Current
      if ($value.IsPassword) { return }
      $role = $value.ControlType.ProgrammaticName.Replace('ControlType.','')
      $r = $value.BoundingRectangle
      if (-not $value.IsOffscreen -and $roles -contains $role -and $r.Width -gt 0 -and $r.Height -gt 0) {
        $name = [string]$value.Name
        if ($name.Length -gt 250) { $name = $name.Substring(0,250) }
        $items.Add(@{id=$path;role=$role;name=$name;enabled=[bool]$value.IsEnabled;bounds=@{x=$r.X;y=$r.Y;width=$r.Width;height=$r.Height}})
      }
      $child = $walker.GetFirstChild($node)
      $i = 0
      while ($null -ne $child -and $items.Count -lt 180 -and $watch.ElapsedMilliseconds -le 250) {
        Walk-Interface $child "$path.$i" ($depth+1)
        $child = $walker.GetNextSibling($child)
        $i++
      }
    } catch { }
  }
  $accessible = $false
  try {
    # Include the app's separate popup/menu roots, not just its main window.
    $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$targetPid)
    $roots = [System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition)
    for ($i=0; $i -lt $roots.Count; $i++) { Walk-Interface $roots[$i] "window.$i" 0 }
    $accessible = $roots.Count -gt 0
  } catch { }
  return @{frontPid=$frontPid;activity=[string]$inputInfo.Tick;accessible=$accessible;elements=@($items.ToArray())}
}
while ($null -ne ($command = [Console]::ReadLine())) {
  $result = $null
  try {
    if ($command -eq 'read') { $result = Read-Window }
    elseif ($command -match '^observe:([0-9]+)$') { $result = Observe-Interface ([int]$Matches[1]) }
    elseif ($command -match '^activate:([0-9]+)$') {
      $targetPid = [int]$Matches[1]
      $window = Read-Window
      if ($null -ne $window -and $window.pid -eq $targetPid -and $targetPid -ne $excluded) {
        $result = [BitoWindows]::SetForegroundWindow([IntPtr][long]$window.id)
      }
    }
  } catch { $result = $null }
  if ($null -eq $result) { [Console]::WriteLine('null') } else { [Console]::WriteLine(($result | ConvertTo-Json -Compress -Depth 12)) }
}
