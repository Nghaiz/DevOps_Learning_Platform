#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# paced-run.sh — chạy TRỌN bộ e2e trên cụm mà không tự làm mình đỏ bằng 429.
#
# VÌ SAO CẦN CHIA MẺ
#
# `playwright.config.ts` đã `workers: 1` + `fullyParallel: false`, nên 429 KHÔNG
# đến từ chạy song song. Nó đến từ chạy LIÊN TỤC: rate-limit của BFF là
# **120 request / 60s** cho mỗi khoá (`RATE_LIMIT_MAX_REQUESTS`,
# `RATE_LIMIT_WINDOW_MS` trong `src/server/security/rate-limit.ts`), và một lượt
# đầy đủ đi qua ~90 màn hình liên tiếp bằng CÙNG một tài khoản.
#
# Đo 2026-09-08 trên ảnh `p14a`, chạy một mạch: **31 pass / 63 ĐỎ**, và mọi lỗi
# đều là `HTTP 429` hoặc `"too_many_requests"` — KHÔNG một lỗi sản phẩm nào. Chia
# mẻ + nghỉ thì cùng cây mã ấy xanh.
#
# ⛔ ĐÂY LÀ CÁI BẪY, KHÔNG PHẢI MỘT PHIỀN TOÁI. Một lượt đỏ vì 429 đọc y hệt một
# lượt đỏ vì hồi quy: cùng là `axe /me` đỏ, cùng là `csp /login` đỏ. Và nó tệ hơn
# khi cụm KHOẺ — cụm nhanh thì các lượt gọi dồn sát nhau hơn, mất phần giãn nhịp
# tình cờ mà một cụm chậm vô tình cấp cho. Nên "hôm nay đỏ nhiều hơn hôm qua" có
# thể có nghĩa là "hôm nay hạ tầng nhanh hơn".
#
# ⚠ ĐỪNG "sửa" bằng cách nới rate-limit hay bật `retries`. Nới là đổi cấu hình
# sản xuất cho tiện việc đo. `retries` làm suite trông xanh trong khi nó không
# xanh — và sẽ nuốt luôn một hồi quy thật ở lần chạy lại.
#
# Dùng:
#   E2E_EMAIL=… E2E_PASSWORD=… bash apps/web/e2e/scripts/paced-run.sh
#   NGHI=90 bash apps/web/e2e/scripts/paced-run.sh        # nghỉ lâu hơn
#   ME="a11y csp" bash apps/web/e2e/scripts/paced-run.sh  # chỉ vài mẻ
#
# Env bắt buộc (xem e2e/env.ts): E2E_BASE_URL · E2E_ORIGIN · E2E_EMAIL ·
# E2E_PASSWORD. Và HAI cờ dưới đây, KHÔNG được bỏ:
#   E2E_REQUIRE_ROLES=1    — thiếu nó, 5 màn quản trị lặng lẽ `skip`
#   E2E_REQUIRE_SESSION=1  — thiếu nó, 3 ô D10 (Esc-Esc) lặng lẽ `skip`
# Một lượt mà chúng đều skip trông y hệt một lượt chúng pass.
#
# Thoát: 0 = mọi mẻ xanh · 1 = có mẻ đỏ (tên in ở cuối)
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail

GOC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
NGHI="${NGHI:-75}"   # > cửa sổ 60s của rate-limit, cộng biên

# Mỗi mẻ là một lượt `playwright test` riêng. Bảy luồng tách rời nhau vì mỗi
# luồng tự dựng một phiên sandbox thật; gộp chúng là dồn cả bucket vào một phút.
MAC_DINH=(
  "flows/lesson.flow.spec.ts"
  "flows/lab.flow.spec.ts"
  "flows/quiz.flow.spec.ts"
  "flows/path.flow.spec.ts"
  "flows/author.flow.spec.ts"
  "flows/admin.flow.spec.ts"
  "flows/playground.flow.spec.ts"
  "a11y.spec.ts"
  "csp.spec.ts"
  "keyboard.spec.ts"
  "responsive.spec.ts"
  "perf.spec.ts"
)
read -r -a ME <<< "${ME:-${MAC_DINH[*]}}"

for c in E2E_EMAIL E2E_PASSWORD; do
  [[ -n "${!c:-}" ]] || { echo "LỖI: thiếu env $c" >&2; exit 2; }
done
: "${E2E_REQUIRE_ROLES:?bắt buộc =1 — xem chú thích đầu file}"
: "${E2E_REQUIRE_SESSION:?bắt buộc =1 — xem chú thích đầu file}"

# MOT SPEC CUNG CO THE TU VUOT TRAN. `a11y` (25 o), `csp` (27) va `keyboard` (25)
# moi o mo mot man hinh day du, nen mot me duy nhat da qua 120 request/60s.
# Do 2026-09-08: chia me theo FILE thoi van cho a11y 11 do / csp 13 / keyboard 13,
# va phan loai lai thi 9/9 loi a11y la 429, KHONG mot loi nao khac. Nen ba file do
# phai cat tiep bang `--shard`, moi phan nghi nhu mot me rieng.
#
# `--shard` chia theo thu tu on dinh, KHONG ngau nhien, nen mot o do van tai hien
# duoc o dung phan do.
so_phan() {
  case "$1" in
    a11y.spec.ts | csp.spec.ts | keyboard.spec.ts) echo 3 ;;
    *) echo 1 ;;
  esac
}

DO=()
MEBAT=()
for spec in "${ME[@]}"; do
  n="$(so_phan "$spec")"
  if [[ "$n" -eq 1 ]]; then
    MEBAT+=("$spec|")
  else
    for k in $(seq 1 "$n"); do MEBAT+=("$spec|$k/$n"); done
  fi
done

TONG=${#MEBAT[@]}
i=0
for muc in "${MEBAT[@]}"; do
  i=$((i + 1))
  spec="${muc%%|*}"; shard="${muc##*|}"
  nhan="$spec"; doi=()
  if [[ -n "$shard" ]]; then nhan="$spec (phan $shard)"; doi=(--shard="$shard"); fi
  printf '\n===== [paced] me %d/%d : %s  (%s) =====\n' "$i" "$TONG" "$nhan" "$(date -Is)"
  ( cd "$GOC" && pnpm --filter web exec playwright test "e2e/$spec" "${doi[@]}" ) 2>&1 | tail -20
  MA=${PIPESTATUS[0]}
  [[ "$MA" -eq 0 ]] || DO+=("$nhan")
  printf '[paced] me %d exit=%d\n' "$i" "$MA"
  if [[ "$i" -lt "$TONG" ]]; then
    printf '[paced] nghi %ss de bucket rate-limit hoi lai...\n' "$NGHI"
    sleep "$NGHI"
  fi
done

printf '\n===== [paced] TỔNG =====\n'
if [[ ${#DO[@]} -eq 0 ]]; then
  printf 'mọi mẻ XANH (%d mẻ)\n' "$TONG"
  exit 0
fi
printf 'mẻ ĐỎ (%d/%d):\n' "${#DO[@]}" "$TONG"
printf '  %s\n' "${DO[@]}"
printf '\n⚠ Trước khi đọc thành hồi quy: kiểm lỗi có phải 429 không.\n'
printf '   grep -c "too_many_requests\\|HTTP 429" apps/web/e2e/.artifacts/results.json\n'
exit 1
