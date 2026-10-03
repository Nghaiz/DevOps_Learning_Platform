#!/bin/bash
set -uo pipefail
f=/root/fixture/greeting.txt
check "$f tồn tại" test -f "$f"
if [ "$(cat "$f" 2>/dev/null)" = "xin chao" ]; then
  pass "$f chứa đúng một dòng 'xin chao'"
else
  fail "$f chứa đúng một dòng 'xin chao' (hiện: '$(head -c 40 "$f" 2>/dev/null)')"
fi
