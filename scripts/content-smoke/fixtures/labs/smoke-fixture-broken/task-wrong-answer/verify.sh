#!/bin/bash
# Không có `exit 1` ở cuối — prelude (trap EXIT) phải tự ép exit ≠ 0 khi có `fail`.
set -uo pipefail
v=$(cat /root/fx/answer.txt 2>/dev/null)
if [ "$v" = 42 ]; then pass "/root/fx/answer.txt chứa 42"; else fail "/root/fx/answer.txt chứa 42 (hiện: '${v}')"; fi
