Write-Output ""
Write-Output "=== Stop Snapshot ==="
Write-Output "Time   : $(Get-Date -Format o)"

$branch = git branch --show-current 2>$null
if (-not $branch) { $branch = "unknown" }

$commit = git log -1 --oneline 2>$null
if (-not $commit) { $commit = "none" }

Write-Output "Branch : $branch"
Write-Output "Commit : $commit"
Write-Output ""
Write-Output "Modified files:"
$modified = git diff --name-only 2>$null
if ($modified) {
  $modified | ForEach-Object { Write-Output "  $_" }
} else {
  Write-Output "  none"
}
Write-Output ""
Write-Output "Staged files:"
$staged = git diff --cached --name-only 2>$null
if ($staged) {
  $staged | ForEach-Object { Write-Output "  $_" }
} else {
  Write-Output "  none"
}
Write-Output "====================="
Write-Output ""

