#!/bin/bash
set -uo pipefail
f=/root/fixture/config.ini
check "$f có mode=published" grep -qx 'mode=published' "$f"
check "$f vẫn giữ owner=dlp" grep -qx 'owner=dlp' "$f"
perm=$(stat -c '%a' "$f" 2>/dev/null || echo '?')
if [ "$perm" = 600 ]; then pass "$f chỉ chủ file đọc/ghi được"; else fail "$f chỉ chủ file đọc/ghi được (hiện: $perm)"; fi
