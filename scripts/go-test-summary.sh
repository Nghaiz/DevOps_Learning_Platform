#!/usr/bin/env bash
# go-test-summary.sh — chạy suite Go của cả ba module và in PASS/SKIP/FAIL.
#
# ⛔ LUÔN GIỮ TÊN CA ĐỎ, KHÔNG CHỈ ĐẾM. Đây là lý do script này tồn tại thay vì
# một dòng `grep -c` viết lại mỗi lần: 1.G-1 gặp một ca đỏ chập chờn và ghi
# "tên ca không được giữ lại"; 1.G-4 dẫm lại y hệt vì vẫn đếm-không-giữ. Ca đỏ
# chập chờn thường chỉ cho ta MỘT cơ hội bắt tên — mất là phải đi săn lại nó.
#
# ⛔ EXPORT REDIS_URL + DATABASE_URL TRƯỚC KHI CHẠY. Thiếu chúng thì 81 ca tự
# SKIP và suite xanh mà không kiểm gì. Script từ chối chạy nếu thiếu, thay vì
# cho ra một màu xanh vô nghĩa.
#
#   REDIS_URL=redis://:<pw>@127.0.0.1:6379/0 \
#   DATABASE_URL=postgres://<u>:<pw>@127.0.0.1:5432/<db>?sslmode=disable \
#     scripts/go-test-summary.sh [thu-muc-log]
set -uo pipefail

if [[ -z "${REDIS_URL:-}" || -z "${DATABASE_URL:-}" ]]; then
  echo "LỖI: cần cả REDIS_URL lẫn DATABASE_URL." >&2
  echo "Thiếu chúng thì 81 ca Go tự SKIP và suite xanh mà không kiểm gì." >&2
  exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOGDIR="${1:-$ROOT/.go-test-logs}"
mkdir -p "$LOGDIR"

modules=(services/terminal-gateway services/orchestrator services/shared)
tp=0 ts=0 tf=0 code=0

for m in "${modules[@]}"; do
  log="$LOGDIR/$(basename "$m").log"
  (cd "$ROOT/$m" && go test ./... -count=1 -v) >"$log" 2>&1

  p=$(grep -cE '^\s*--- PASS' "$log")
  s=$(grep -cE '^\s*--- SKIP' "$log")
  f=$(grep -cE '^\s*--- FAIL' "$log")
  printf '%-28s PASS=%-4s SKIP=%-3s FAIL=%s\n' "$m" "$p" "$s" "$f"

  # Tên ca đỏ in NGAY, không đợi ai đi mở log — vế mà bản cũ làm mất.
  if (( f > 0 )); then
    code=1
    echo "  ── ca đỏ (log đầy đủ: $log):"
    grep -E '^\s*--- FAIL' "$log" | sed 's/^/     /'
  fi

  tp=$((tp + p)); ts=$((ts + s)); tf=$((tf + f))
done

printf '%-28s PASS=%-4s SKIP=%-3s FAIL=%s\n' "TỔNG" "$tp" "$ts" "$tf"

# SKIP > 0 không làm đỏ, nhưng phải nói ra: một suite toàn SKIP cũng exit 0.
if (( ts > 0 )); then
  echo "⚠ có $ts ca SKIP — kiểm REDIS_URL/DATABASE_URL có trỏ đúng không."
fi

exit "$code"
