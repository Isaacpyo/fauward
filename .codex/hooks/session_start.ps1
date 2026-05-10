Write-Output ""
Write-Output "=== Fauward Dev Session ==="

$branch = git branch --show-current 2>$null
if (-not $branch) { $branch = "unknown" }

$commit = git log -1 --oneline 2>$null
if (-not $commit) { $commit = "none" }

$changed = @(git diff --name-only 2>$null).Count
$staged = @(git diff --cached --name-only 2>$null).Count

Write-Output "Branch : $branch"
Write-Output "Commit : $commit"
Write-Output "Changed: $changed file(s) modified"
Write-Output "Staged : $staged file(s) staged"
Write-Output ""
Write-Output "Docs   -> docs/implementation-status.md"
Write-Output "==========================="
Write-Output ""

