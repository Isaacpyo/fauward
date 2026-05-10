#!/bin/bash
# Saves a snapshot of current working state before context compaction.
echo ""
echo "=== PreCompact Snapshot ==="
echo "Time   : $(date)"
echo "Branch : $(git branch --show-current 2>/dev/null)"
echo "Commit : $(git log -1 --oneline 2>/dev/null)"
echo ""
echo "Modified files:"
git diff --name-only 2>/dev/null | sed 's/^/  /'
echo ""
echo "Staged files:"
git diff --cached --name-only 2>/dev/null | sed 's/^/  /'
echo "==========================="
echo ""
