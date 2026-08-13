#!/usr/bin/env bash
# Kiểm đột biến cho cổng shell "Khẳng định lượt quét ĐÃ THẬT SỰ chạy" của 1.G-6 R3.
#
# Job `images` chỉ chạy trên `main`, nên đoạn shell này KHÔNG có lượt chạy nào ở
# PR — đúng họ lỗi mà §"Còn để ngỏ" đã ghi thành chữ ("job chỉ chạy trên main
# nghĩa là file đó không có review gate"). Bộ này là cổng thay thế: chạy chính
# đoạn shell ấy trên bốn đầu vào và khẳng định nó phân biệt được chúng.
#
# Chạy: bash guard-scan-ran.sh
set -uo pipefail

# ⛔ Đoạn dưới phải là BẢN SAO NGUYÊN VĂN của bước trong ci.yml. Nếu sửa một bên
# mà quên bên kia thì bộ này gác một thứ không còn tồn tại.
guard() {
  local f="$1"
  (
    test -s "$f" || { echo "::error::Trivy không sinh báo cáo — nhiều khả năng FATAL trước khi quét"; exit 1; }
    grep -qiE 'Report Summary|Total:|no vulnerabilities|Legend' "$f" || {
      echo "::error::báo cáo Trivy không có dấu hiệu của một lượt quét hoàn tất"; cat "$f"; exit 1; }
    echo "lượt quét hoàn tất, 0 CRITICAL."
  )
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Ca 1 — file KHÔNG tồn tại (Trivy chết trước khi mở được file output).
missing="$tmp/khong-ton-tai.txt"

# Ca 2 — file RỖNG. Đây là ca thật đã gặp ở 1.E-2: Trivy FATAL vì không tải được
# DB lỗ hổng, `--exit-code 1` vẫn có thể trả 0, và output rỗng.
empty="$tmp/rong.txt"
: >"$empty"

# Ca 3 — file CÓ NỘI DUNG nhưng không phải báo cáo (stderr lọt vào chỗ output).
garbage="$tmp/rac.txt"
printf 'FATAL\tunable to initialize a scanner: failed to download vulnerability DB\n' >"$garbage"

# Ca 4 — ĐỐI CHỨNG DƯƠNG: báo cáo thật, hình dạng Trivy `format: table`, 0 CRITICAL.
# Không có ca này thì một cổng "luôn đỏ" cũng qua được ba ca trên.
good="$tmp/that.txt"
cat >"$good" <<'EOF'

Report Summary

┌──────────────────┬────────┬─────────────────┬─────────┐
│      Target      │  Type  │ Vulnerabilities │ Secrets │
├──────────────────┼────────┼─────────────────┼─────────┤
│ dlp-web:scan     │ alpine │        0        │    -    │
└──────────────────┴────────┴─────────────────┴─────────┘
Legend:
- '-': Not scanned
EOF

declare -a NAMES=('thiếu file' 'file rỗng' 'FATAL lọt vào output' 'ĐỐI CHỨNG DƯƠNG: báo cáo thật')
declare -a FILES=("$missing" "$empty" "$garbage" "$good")
declare -a WANT=(1 1 1 0)

fail=0
echo
echo "=== CỔNG 'lượt quét đã thật sự chạy' — 4 ca ==="
echo
for i in 0 1 2 3; do
  out=$(guard "${FILES[$i]}" 2>&1)
  got=$?
  if [ "$got" -eq "${WANT[$i]}" ]; then
    verdict="ĐÚNG"
  else
    verdict="SAI"
    fail=1
  fi
  printf '%-32s kỳ vọng exit=%s  thực tế=%s  %s\n' "${NAMES[$i]}" "${WANT[$i]}" "$got" "$verdict"
  printf '    %s\n' "$(echo "$out" | head -1)"
done

echo
if [ "$fail" -ne 0 ]; then
  echo "⛔ CỔNG KHÔNG PHÂN BIỆT ĐƯỢC — đừng tin nó trong CI."
  exit 1
fi
echo "Cổng phân biệt đúng cả 4 ca: ba chế độ 'chưa quét được gì' đều chặn, báo cáo thật cho qua."
